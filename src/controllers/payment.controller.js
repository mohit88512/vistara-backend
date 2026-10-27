import Razorpay from "razorpay";
import crypto from "crypto";
import mongoose from "mongoose";

import Cart from "../models/cart.js";
import Order from "../models/order.js";
import Product from "../models/product.js";
import PaymentWebhookEvent from "../models/paymentWebhookEvent.js";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const finalizePaidOrder = async ({ orderId, paymentId, session }) => {
  const order = await Order.findById(orderId).session(session);

  if (!order) {
    throw new Error("Order not found");
  }

  // Never deduct stock twice for an already-paid order.
  if (order.paymentStatus === "paid") {
    return { alreadyProcessed: true, order };
  }

  if (order.paymentStatus !== "pending") {
    throw new Error("Order is not awaiting payment");
  }

  // Deduct stock atomically inside the transaction.
  for (const item of order.items) {
    const updatedProduct = await Product.findOneAndUpdate(
      {
        _id: item.product,
        status: "active",
        inStock: true,
        stockCount: { $gte: item.quantity },
      },
      {
        $inc: { stockCount: -item.quantity },
      },
      {
        new: true,
        session,
      },
    );

    if (!updatedProduct) {
      const error = new Error(
        `Insufficient stock or unavailable product: ${item.name}`,
      );

      error.code = "STOCK_FULFILLMENT_FAILED";
      throw error;
    }

    updatedProduct.inStock = updatedProduct.stockCount > 0;
    await updatedProduct.save({ session });
  }

  // Remove only the purchased quantity from the cart.
  for (const item of order.items) {
    await Cart.updateOne(
      {
        user: order.customer,
        items: {
          $elemMatch: {
            product: item.product,
            quantity: { $gte: item.quantity },
          },
        },
      },
      {
        $inc: {
          "items.$.quantity": -item.quantity,
        },
      },
      { session },
    );

    // Remove the cart item if its remaining quantity is zero.
    await Cart.updateOne(
      { user: order.customer },
      {
        $pull: {
          items: {
            product: item.product,
            quantity: { $lte: 0 },
          },
        },
      },
      { session },
    );
  }

  order.paymentStatus = "paid";
  order.razorpayPaymentId = paymentId;
  order.fulfillmentStatus = "fulfilled";
  order.stockDeducted = true;
  order.reconciliationStatus = "not_required";
  order.reconciliationReason = "";
  order.refundStatus = "not_required";

  await order.save({ session });

  return { alreadyProcessed: false, order };
};

const markPaymentForReconciliation = async (
  razorpayOrderId,
  reason,
  paymentId,
) => {
  return Order.findOneAndUpdate(
    {
      razorpayOrderId,
      paymentMethod: "RAZORPAY",
      paymentStatus: "pending",
      stockDeducted: { $ne: true },
    },
    {
      $set: {
        paymentStatus: "paid",
        razorpayPaymentId: paymentId,
        fulfillmentStatus: "failed",
        stockDeducted: false,
        reconciliationStatus: "required",
        reconciliationReason: reason,
        refundStatus: "pending",
      },
    },
    { new: true },
  );
};


const initiateRefund = async (orderId) => {
  const order = await Order.findById(orderId);

  if (!order) {
    throw new Error("Order not found");
  }

 if (
  order.paymentStatus !== "paid" ||
  order.fulfillmentStatus !== "failed" ||
  order.reconciliationStatus !== "required" ||
  order.refundStatus !== "pending" ||
  order.razorpayRefundId
) {
  throw new Error("Order is not eligible for a new refund");
}

  if (!order.razorpayPaymentId) {
    throw new Error("Razorpay payment ID is missing");
  }

  const refund = await razorpay.payments.refund(
    order.razorpayPaymentId,
    {
      amount: order.totalAmount * 100,
      notes: {
        orderId: order._id.toString(),
        reason: "Stock fulfillment failed",
      },
    },
  );

  order.refundStatus = "pending";
  order.razorpayRefundId = refund.id;
  order.reconciliationStatus = "in_progress";

  await order.save();

  return refund;
};


export const createPaymentOrder = async (req, res) => {
  try {
    const userId = req.user.id;
    const { shippingAddress } = req.body;

    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user",
      });
    }

    // Validate shipping address
    const requiredFields = [
      "fullName",
      "phone",
      "addressLine",
      "city",
      "state",
      "postalCode",
    ];

    if (
      !shippingAddress ||
      requiredFields.some(
        (field) =>
          typeof shippingAddress[field] !== "string" ||
          !shippingAddress[field].trim(),
      )
    ) {
      return res.status(400).json({
        success: false,
        message: "Complete shipping address is required",
      });
    }

    // Get the logged-in customer's cart
    const cart = await Cart.findOne({ user: userId }).populate("items.product");

    if (!cart || cart.items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Your cart is empty",
      });
    }

    let totalAmount = 0;
    const orderItems = [];

    for (const item of cart.items) {
      const product = item.product;

      if (
        !product ||
        product.status !== "active" ||
        !product.inStock ||
        product.stockCount < item.quantity
      ) {
        return res.status(400).json({
          success: false,
          message: "A cart product is unavailable or has insufficient stock",
        });
      }

      totalAmount += product.price * item.quantity;

      orderItems.push({
        product: product._id,
        seller: product.owner,
        name: product.name,
        image: product.images?.[0] || "",
        price: product.price,
        quantity: item.quantity,
      });
    }

    if (!Number.isSafeInteger(totalAmount) || totalAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid order amount",
      });
    }

    // Razorpay accepts amount in paise (₹1 = 100 paise)
    const razorpayOrder = await razorpay.orders.create({
      amount: totalAmount * 100,
      currency: "INR",
      receipt: `rcpt_${Date.now()}`,
    });

    // Save a server-side snapshot to verify the payment later
    const order = await Order.create({
      customer: userId,
      items: orderItems,
      totalAmount,
      shippingAddress,
      paymentMethod: "RAZORPAY",
      paymentStatus: "pending",
      status: "pending",
      razorpayOrderId: razorpayOrder.id,
    });

    return res.status(201).json({
      success: true,
      message: "Payment order created successfully",
      data: {
        orderId: order._id,
        razorpayOrderId: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        keyId: process.env.RAZORPAY_KEY_ID,
      },
    });
  } catch (error) {
    console.error("Create payment order error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create payment order",
    });
  }
};

export const verifyPayment = async (req, res) => {
  let session;

  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
      req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: "Payment verification details are required",
      });
    }

    const order = await Order.findOne({
      razorpayOrderId: razorpay_order_id,
      customer: req.user.id,
      paymentMethod: "RAZORPAY",
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Payment order not found",
      });
    }

    // Idempotent response: never deduct stock twice.
    if (order.paymentStatus === "paid") {
      return res.status(200).json({
        success: true,
        message: "Payment has already been verified",
        data: {
          orderId: order._id,
          paymentStatus: order.paymentStatus,
          status: order.status,
        },
      });
    }

    if (order.paymentStatus !== "pending") {
      return res.status(400).json({
        success: false,
        message: "Order is not awaiting payment",
      });
    }

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    const received = Buffer.from(razorpay_signature, "hex");
    const expected = Buffer.from(expectedSignature, "hex");

    if (
      received.length !== expected.length ||
      !crypto.timingSafeEqual(received, expected)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment signature",
      });
    }

    const payment = await razorpay.payments.fetch(razorpay_payment_id);

    if (
      payment.order_id !== razorpay_order_id ||
      payment.status !== "captured" ||
      payment.amount !== order.totalAmount * 100 ||
      payment.currency !== "INR"
    ) {
      return res.status(400).json({
        success: false,
        message: "Payment is not captured or details do not match",
      });
    }

    session = await mongoose.startSession();

    let result;

    await session.withTransaction(async () => {
      result = await finalizePaidOrder({
        orderId: order._id,
        paymentId: razorpay_payment_id,
        session,
      });
    });

    return res.status(200).json({
      success: true,
      message: result.alreadyProcessed
        ? "Payment has already been finalized"
        : "Payment verified and order finalized successfully",
      data: {
        orderId: result.order._id,
        paymentStatus: result.order.paymentStatus,
        status: result.order.status,
      },
    });
  } catch (error) {
    console.error("Verify payment error:", error);

    if (error.code === "STOCK_FULFILLMENT_FAILED") {
      try {
        const { razorpay_order_id, razorpay_payment_id } = req.body;

        const reconciledOrder = await markPaymentForReconciliation(
          razorpay_order_id,
          error.message,
          razorpay_payment_id,
        );

        if (reconciledOrder) {
          return res.status(200).json({
            success: true,
            message:
              "Payment received, but stock fulfillment failed. Refund reconciliation is required.",
            data: {
              orderId: reconciledOrder._id,
              paymentStatus: reconciledOrder.paymentStatus,
              fulfillmentStatus: reconciledOrder.fulfillmentStatus,
              reconciliationStatus: reconciledOrder.reconciliationStatus,
            },
          });
        }
      } catch (reconciliationError) {
        console.error("Reconciliation error:", reconciliationError);
      }
    }

    return res.status(500).json({
      success: false,
      message: "Payment verification or finalization failed",
    });
  } finally {
    if (session) {
      await session.endSession();
    }
  }
};

export const handleRazorpayWebhook = async (req, res) => {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  const signature = req.headers["x-razorpay-signature"];
  const eventId = req.headers["x-razorpay-event-id"];

  if (!webhookSecret || !Buffer.isBuffer(req.body) || !signature || !eventId) {
    return res.status(400).json({
      success: false,
      message: "Invalid webhook request",
    });
  }

  let session;
  let capturedPayment = null;

  try {
    // Verify the signature against the exact raw body.
    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(req.body)
      .digest("hex");

    const received = Buffer.from(signature, "hex");
    const expected = Buffer.from(expectedSignature, "hex");

    if (
      received.length !== expected.length ||
      !crypto.timingSafeEqual(received, expected)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid webhook signature",
      });
    }

    const event = JSON.parse(req.body.toString("utf8"));

    // Acknowledge unrelated events without processing them.
    if (!["payment.captured", "payment.failed"].includes(event.event)) {
      return res.status(200).json({
        success: true,
        received: true,
        message: "Event ignored",
      });
    }

    const payment = event.payload?.payment?.entity;

    if (event.event === "payment.captured") {
      capturedPayment = payment;
    }

    if (!payment?.order_id || !payment?.id) {
      return res.status(400).json({
        success: false,
        message: "Payment details missing from event",
      });
    }

    session = await mongoose.startSession();

    let alreadyProcessed = false;

    await session.withTransaction(async () => {
      // Unique eventId prevents duplicate event processing.
      await PaymentWebhookEvent.create(
        [
          {
            eventId,
            eventType: event.event,
            processed: false,
          },
        ],
        { session },
      );

      const order = await Order.findOne({
        razorpayOrderId: payment.order_id,
        paymentMethod: "RAZORPAY",
      }).session(session);

      if (!order) {
        throw new Error("Order for Razorpay payment not found");
      }

      if (event.event === "payment.captured") {
        if (
          payment.status !== "captured" ||
          payment.amount !== order.totalAmount * 100 ||
          payment.currency !== "INR"
        ) {
          throw new Error("Captured payment details do not match order");
        }

        const result = await finalizePaidOrder({
          orderId: order._id,
          paymentId: payment.id,
          session,
        });

        alreadyProcessed = result.alreadyProcessed;
      } else if (event.event === "payment.failed") {
        // Do not finalize inventory or permanently fail the order
        // based only on an individual failed payment attempt.
        // Payment status will be reconciled separately.
      }

      await PaymentWebhookEvent.updateOne(
        { eventId },
        {
          $set: {
            processed: true,
            processedAt: new Date(),
          },
        },
        { session },
      );
    });

    return res.status(200).json({
      success: true,
      received: true,
      alreadyProcessed,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(200).json({
        success: true,
        received: true,
        message: "Duplicate event already received",
      });
    }

    console.error("Razorpay webhook error:", error);

    if (
      error.code === "STOCK_FULFILLMENT_FAILED" &&
      capturedPayment?.order_id &&
      capturedPayment?.id
    ) {
      try {
        const reconciledOrder = await markPaymentForReconciliation(
          capturedPayment.order_id,
          error.message,
          capturedPayment.id,
        );

        if (reconciledOrder) {
          // Return 200 only after reconciliation was recorded.
          return res.status(200).json({
            success: true,
            received: true,
            message: "Payment captured; fulfillment requires reconciliation",
            reconciliationStatus: reconciledOrder.reconciliationStatus,
          });
        }
      } catch (reconciliationError) {
        console.error("Webhook reconciliation error:", reconciliationError);
      }
    }

    return res.status(500).json({
      success: false,
      message: "Webhook processing failed",
    });
  } finally {
    if (session) {
      await session.endSession();
    }
  }
};
