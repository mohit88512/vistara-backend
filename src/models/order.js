
import mongoose from "mongoose";

const orderSchema = new mongoose.Schema(
  {
    // Customer who placed the order
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Products included in the order
    items: [
      {
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },

        seller: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },

        name: {
          type: String,
          required: true,
        },

        image: {
          type: String,
          default: "",
        },

        price: {
          type: Number,
          required: true,
          min: 0,
        },

        quantity: {
          type: Number,
          required: true,
          min: 1,
        },
      },
    ],

    // Order total
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    // Shipping details
    shippingAddress: {
      fullName: {
        type: String,
        required: true,
        trim: true,
      },
      phone: {
        type: String,
        required: true,
        trim: true,
      },
      addressLine: {
        type: String,
        required: true,
        trim: true,
      },
      city: {
        type: String,
        required: true,
        trim: true,
      },
      state: {
        type: String,
        required: true,
        trim: true,
      },
      postalCode: {
        type: String,
        required: true,
        trim: true,
      },
      country: {
        type: String,
        default: "India",
        trim: true,
      },
    },

    // Payment method
    paymentMethod: {
      type: String,
      enum: ["COD", "RAZORPAY"],
      default: "COD",
    },

    // Payment status
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed", "refunded"],
      default: "pending",
    },

    // Overall order status
    status: {
      type: String,
      enum: [
        "pending",
        "confirmed",
        "shipped",
        "delivered",
        "cancelled",
      ],
      default: "pending",
      index: true,
    },

    // Inventory fulfillment tracking
    fulfillmentStatus: {
      type: String,
      enum: ["pending", "fulfilled", "failed"],
      default: "pending",
      index: true,
    },

    stockDeducted: {
      type: Boolean,
      default: false,
    },

    // Payment reconciliation tracking
    reconciliationStatus: {
      type: String,
      enum: [
        "not_required",
        "required",
        "in_progress",
        "resolved",
      ],
      default: "not_required",
      index: true,
    },

    reconciliationReason: {
      type: String,
      default: "",
    },

    // Refund tracking
    refundStatus: {
      type: String,
      enum: [
        "not_required",
        "pending",
        "processed",
        "failed",
      ],
      default: "not_required",
    },

    razorpayRefundId: {
      type: String,
      default: null,
    },

    // Razorpay references
    razorpayOrderId: {
      type: String,
      default: null,
    },

    razorpayPaymentId: {
      type: String,
      default: null,
    },
  },
  { timestamps: true },
);

const Order =
  mongoose.models.Order ||
  mongoose.model("Order", orderSchema);

export default Order;
