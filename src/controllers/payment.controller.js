import Razorpay from "razorpay";
import crypto from "crypto";
import mongoose from "mongoose";
import Cart from "../models/cart.js";
import Order from "../models/order.js";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

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
          !shippingAddress[field].trim()
      )
    ) {
      return res.status(400).json({
        success: false,
        message: "Complete shipping address is required",
      });
    }

    // Get the logged-in customer's cart
    const cart = await Cart.findOne({ user: userId }).populate(
      "items.product"
    );

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
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = req.body;

    if (
      !razorpay_order_id ||
      !razorpay_payment_id ||
      !razorpay_signature
    ) {
      return res.status(400).json({
        success: false,
        message: "Payment verification details are required",
      });
    }

    // Find the order created by our backend
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

    // Do not verify or process the same order twice
    if (order.paymentStatus === "paid") {
      return res.status(200).json({
        success: true,
        message: "Payment has already been verified",
        data: {
          orderId: order._id,
          paymentStatus: order.paymentStatus,
        },
      });
    }

    if (order.paymentStatus !== "pending") {
      return res.status(400).json({
        success: false,
        message: "Order is not awaiting payment",
      });
    }

    // Generate the expected Razorpay signature
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    const received = Buffer.from(razorpay_signature, "hex");
    const expected = Buffer.from(expectedSignature, "hex");

    const signatureIsValid =
      received.length === expected.length &&
      crypto.timingSafeEqual(received, expected);

    if (!signatureIsValid) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment signature",
      });
    }

    // Fetch payment details directly from Razorpay
    const payment = await razorpay.payments.fetch(
      razorpay_payment_id
    );

    if (
      payment.order_id !== razorpay_order_id ||
      payment.status !== "captured" ||
      payment.amount !== order.totalAmount * 100 ||
      payment.currency !== "INR"
    ) {
      return res.status(400).json({
        success: false,
        message: "Payment is not captured or payment details do not match",
      });
    }

    // Record verified payment. Stock finalization and cart clearing
    // must be handled atomically before using this flow in production.
    order.paymentStatus = "paid";
    order.razorpayPaymentId = razorpay_payment_id;
    await order.save();

    return res.status(200).json({
      success: true,
      message: "Payment verified successfully",
      data: {
        orderId: order._id,
        razorpayPaymentId: razorpay_payment_id,
        paymentStatus: order.paymentStatus,
        status: order.status,
      },
    });
  } catch (error) {
    console.error("Verify payment error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to verify payment",
    });
  }
};


export const handleRazorpayWebhook = async (req, res) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = req.headers["x-razorpay-signature"];

    if (!webhookSecret || !Buffer.isBuffer(req.body) || !signature) {
      return res.status(400).json({
        success: false,
        message: "Invalid webhook request",
      });
    }

    // Verify signature against the exact raw request body.
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
    const payment = event.payload?.payment?.entity;

    if (
      ["payment.captured", "payment.failed"].includes(event.event) &&
      payment?.order_id
    ) {
      const order = await Order.findOne({
        razorpayOrderId: payment.order_id,
        paymentMethod: "RAZORPAY",
      });

      if (order) {
        // Validate payment details before accepting capture.
        if (
          event.event === "payment.captured" &&
          payment.amount === order.totalAmount * 100 &&
          payment.currency === "INR" &&
          payment.status === "captured"
        ) {
          if (order.paymentStatus !== "paid") {
            order.paymentStatus = "paid";
            order.razorpayPaymentId = payment.id;
            await order.save();
          }
        } else if (
          event.event === "payment.failed" &&
          order.paymentStatus === "pending"
        ) {
          order.paymentStatus = "failed";
          order.razorpayPaymentId = payment.id;
          await order.save();
        }
      }
    }

    return res.status(200).json({
      success: true,
      received: true,
    });
  } catch (error) {
    console.error("Razorpay webhook error:", error);

    return res.status(500).json({
      success: false,
      message: "Webhook processing failed",
    });
  }
};
