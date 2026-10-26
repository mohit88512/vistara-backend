import mongoose from "mongoose";

const orderSchema = new mongoose.Schema(
  {
    // Kis customer ne order place kiya
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Order ke andar products
    items: [
      {
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },

        // Seller/client ka ID
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

    // Order ka total amount
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    // Delivery details
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

    // Abhi Cash on Delivery support karenge
    paymentMethod: {
      type: String,
      enum: ["COD", "RAZORPAY"],
      default: "COD",
    },

    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed", "refunded"],
      default: "pending",
    },

    // Overall order status
    status: {
      type: String,
      enum: ["pending", "confirmed", "shipped", "delivered", "cancelled"],
      default: "pending",
      index: true,
    },
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

const Order = mongoose.models.Order || mongoose.model("Order", orderSchema);

export default Order;
