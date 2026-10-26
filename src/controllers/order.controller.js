import mongoose from "mongoose";
import Order from "../models/order.js";
import Product from "../models/product.js";

// Customer order place karega
export const createOrder = async (req, res) => {
  const reservedItems = [];

  try {
    const { items, shippingAddress } = req.body;

    // Sirf customers order place kar sakte hain
    if (req.user.role !== "customer") {
      return res.status(403).json({
        success: false,
        message: "Only customers can place orders",
      });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one product is required",
      });
    }

    if (items.length > 50) {
      return res.status(400).json({
        success: false,
        message: "Too many different products in one order",
      });
    }

    const requiredAddressFields = [
      "fullName",
      "phone",
      "addressLine",
      "city",
      "state",
      "postalCode",
    ];

    if (
      !shippingAddress ||
      requiredAddressFields.some(
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

    // Validate and combine duplicate product IDs
    const quantities = new Map();

    for (const item of items) {
      if (
        !item.product ||
        !mongoose.Types.ObjectId.isValid(item.product) ||
        !Number.isSafeInteger(item.quantity) ||
        item.quantity < 1
      ) {
        return res.status(400).json({
          success: false,
          message: "Each item needs a valid product ID and quantity",
        });
      }

      const productId = item.product.toString();
      const newQuantity =
        (quantities.get(productId) || 0) + item.quantity;

      if (!Number.isSafeInteger(newQuantity)) {
        return res.status(400).json({
          success: false,
          message: "Invalid product quantity",
        });
      }

      quantities.set(productId, newQuantity);
    }

    const orderItems = [];
    let totalAmount = 0;

    for (const [productId, quantity] of quantities) {
      // Atomically reserve stock to prevent overselling
      const product = await Product.findOneAndUpdate(
        {
          _id: productId,
          status: "active",
          inStock: true,
          stockCount: { $gte: quantity },
        },
        {
          $inc: { stockCount: -quantity },
        },
        { new: true }
      );

      if (!product) {
        throw new Error(
          `Product ${productId} is unavailable or has insufficient stock`
        );
      }

      reservedItems.push({
        productId: product._id,
        quantity,
      });

      // Keep the stock flag consistent
      if (product.stockCount === 0) {
        await Product.updateOne(
          { _id: product._id, stockCount: 0 },
          { $set: { inStock: false } }
        );
      }

      const lineTotal = product.price * quantity;

      if (!Number.isFinite(lineTotal)) {
        throw new Error("Invalid order amount");
      }

      totalAmount += lineTotal;

      orderItems.push({
        product: product._id,
        seller: product.owner,
        name: product.name,
        image: product.images?.[0] || "",
        price: product.price,
        quantity,
      });
    }

    if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
      throw new Error("Invalid order total");
    }

    const order = await Order.create({
      customer: req.user.id,
      items: orderItems,
      totalAmount,
      shippingAddress: {
        fullName: shippingAddress.fullName.trim(),
        phone: shippingAddress.phone.trim(),
        addressLine: shippingAddress.addressLine.trim(),
        city: shippingAddress.city.trim(),
        state: shippingAddress.state.trim(),
        postalCode: shippingAddress.postalCode.trim(),
        country: shippingAddress.country?.trim() || "India",
      },
      paymentMethod: "COD",
      paymentStatus: "pending",
      status: "pending",
    });

    return res.status(201).json({
      success: true,
      message: "Order placed successfully",
      data: order,
    });
  } catch (error) {
    // Restore any stock reserved before an error occurred
    for (const item of reservedItems.reverse()) {
      try {
        await Product.updateOne(
          { _id: item.productId },
          {
            $inc: { stockCount: item.quantity },
            $set: { inStock: true },
          }
        );
      } catch (rollbackError) {
        console.error(
          "Stock rollback error:",
          rollbackError.message
        );
      }
    }

    console.error("Create order error:", error.message);

    if (error.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(400).json({
      success: false,
      message: error.message || "Failed to place order",
    });
  }
};

// Customer ke saare orders
export const getMyOrders = async (req, res) => {
  try {
    const orders = await Order.find({
      customer: req.user.id,
    })
      .sort({ createdAt: -1 })
      .populate("items.product", "name slug images");

    return res.status(200).json({
      success: true,
      total: orders.length,
      data: orders,
    });
  } catch (error) {
    console.error("Get my orders error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch orders",
    });
  }
};

// Customer ke ek order ki details
export const getMyOrderById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order ID",
      });
    }

    const order = await Order.findOne({
      _id: id,
      customer: req.user.id,
    }).populate("items.product", "name slug images");

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: order,
    });
  } catch (error) {
    console.error("Get order details error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch order details",
    });
  }
};


export const getAllOrdersForAdmin = async (req, res) => {
  try {
    const { status } = req.query;

    const allowedStatuses = [
      "pending",
      "confirmed",
      "shipped",
      "delivered",
      "cancelled",
    ];

    const filter = {};

    if (status) {
      if (!allowedStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid order status",
        });
      }

      filter.status = status;
    }

    const orders = await Order.find(filter)
      .populate("customer", "name email")
      .populate("items.product", "name slug images")
      .populate("items.seller", "name email")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      total: orders.length,
      data: orders,
    });
  } catch (error) {
    console.error("Admin orders error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch orders",
    });
  }
};



export const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const allowedStatuses = [
      "confirmed",
      "shipped",
      "delivered",
      "cancelled",
    ];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order status",
      });
    }

    const allowedTransitions = {
      pending: ["confirmed", "cancelled"],
      confirmed: ["shipped", "cancelled"],
      shipped: ["delivered"],
      delivered: [],
      cancelled: [],
    };

    const currentOrder = await Order.findById(id);

    if (!currentOrder) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    if (!allowedTransitions[currentOrder.status]?.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot change order status from ${currentOrder.status} to ${status}`,
      });
    }

    // Atomically change status only if it has not changed meanwhile.
    const order = await Order.findOneAndUpdate(
      { _id: id, status: currentOrder.status },
      { $set: { status } },
      { new: true, runValidators: true }
    );

    if (!order) {
      return res.status(409).json({
        success: false,
        message: "Order status changed. Please retry.",
      });
    }

    // Restore stock only after a successful cancellation transition.
    if (status === "cancelled") {
      for (const item of order.items) {
        const product = await Product.findByIdAndUpdate(
          item.product,
          {
            $inc: { stockCount: item.quantity },
          },
          { new: true }
        );

        if (product) {
          product.inStock = product.stockCount > 0;
          await product.save();
        }
      }
    }

    return res.status(200).json({
      success: true,
      message: "Order status updated successfully",
      data: order,
    });
  } catch (error) {
    console.error("Update order status error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update order status",
    });
  }
};
