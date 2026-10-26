
import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
  {
    // Optional external product ID
    id: {
      type: String,
      unique: true,
      sparse: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    brand: {
      type: String,
      default: "VISTARA",
      trim: true,
    },

    // Category collection se linked
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
      index: true,
    },

    categoryName: {
      type: String,
      default: "",
    },

    // Product ka owner
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    status: {
      type: String,
      enum: ["pending", "active", "rejected"],
      default: "pending",
      index: true,
    },

    price: {
      type: Number,
      required: true,
      min: 0,
    },

    originalPrice: {
      type: Number,
      default: 0,
      min: 0,
    },

    discountPercentage: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },

    rating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },

    reviewCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    isNewProduct: {
      type: Boolean,
      default: false,
    },

    isBestSeller: {
      type: Boolean,
      default: false,
    },

    inStock: {
      type: Boolean,
      default: true,
    },

    stockCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    shortDescription: {
      type: String,
      required: true,
      trim: true,
    },

    fullDescription: {
      type: String,
      default: "",
    },

    features: {
      type: [String],
      default: [],
    },

    specs: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    images: {
      type: [String],
      default: [],
    },

    availableSizes: {
      type: [String],
      default: [],
    },

    availableColors: [
      {
        name: { type: String, required: true },
        hex: { type: String, default: "#000000" },
      },
    ],
  },
  { timestamps: true }
);

const Product =
  mongoose.models.Product ||
  mongoose.model("Product", productSchema);

export default Product;
