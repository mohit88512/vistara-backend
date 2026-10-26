
import mongoose from "mongoose";
import Product from "../models/product.js";
import Category from "../models/categories.js";

// 1. Public: active products ki listing
export const getProducts = async (req, res) => {
  try {
    const { category, search, sortBy } = req.query;

    const filter = { status: "active" };

    if (category && category !== "all") {
      if (!mongoose.Types.ObjectId.isValid(category)) {
        return res.status(400).json({
          success: false,
          message: "Invalid category ID",
        });
      }

      filter.category = category;
    }

    if (search) {
      const safeSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      filter.$or = [
        { name: { $regex: safeSearch, $options: "i" } },
        { shortDescription: { $regex: safeSearch, $options: "i" } },
        { brand: { $regex: safeSearch, $options: "i" } },
      ];
    }

    const sortOptions = {
      "price-low": { price: 1 },
      "price-high": { price: -1 },
      rating: { rating: -1 },
      newest: { createdAt: -1 },
    };

    const products = await Product.find(filter)
      .populate("category", "name slug")
      .sort(sortOptions[sortBy] || { createdAt: -1 });

    return res.status(200).json({
      success: true,
      data: products,
      total: products.length,
    });
  } catch (error) {
    console.error("Get products error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch products",
    });
  }
};

export const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID",
      });
    }

    const allowedFields = [
      "name",
      "slug",
      "brand",
      "category",
      "price",
      "originalPrice",
      "discountPercentage",
      "shortDescription",
      "fullDescription",
      "features",
      "specs",
      "images",
      "availableSizes",
      "availableColors",
      "stockCount",
      "inStock",
      "isNewProduct",
      "isBestSeller",
    ];

    const updates = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid fields provided for update",
      });
    }

    // Category change ho to active category validate karo
    if (updates.category !== undefined) {
      if (!mongoose.Types.ObjectId.isValid(updates.category)) {
        return res.status(400).json({
          success: false,
          message: "Invalid category ID",
        });
      }

      const categoryExists = await Category.findOne({
        _id: updates.category,
        isActive: true,
      });

      if (!categoryExists) {
        return res.status(400).json({
          success: false,
          message: "Category does not exist or is inactive",
        });
      }
    }

    // Price valid number hona chahiye
    if (updates.price !== undefined) {
      if (
        typeof updates.price !== "number" ||
        !Number.isFinite(updates.price) ||
        updates.price < 0
      ) {
        return res.status(400).json({
          success: false,
          message: "Price must be a valid non-negative number",
        });
      }
    }

    // Admin kisi ka bhi product update kar sakta hai.
    // Client sirf apna product update kar sakta hai.
    const filter =
      req.user.role === "admin"
        ? { _id: id }
        : { _id: id, owner: req.user.id };

    const product = await Product.findOneAndUpdate(
      filter,
      { $set: updates },
      {
        new: true,
        runValidators: true,
      }
    ).populate("category", "name slug");

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found or you do not own this product",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Product updated successfully",
      data: product,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Product slug already exists",
      });
    }

    if (error.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    console.error("Update product error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to update product",
    });
  }
};

// Delete product
export const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID",
      });
    }

    const filter =
      req.user.role === "admin"
        ? { _id: id }
        : { _id: id, owner: req.user.id };

    const product = await Product.findOneAndDelete(filter);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found or you do not own this product",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Product deleted successfully",
      data: { id: product._id },
    });
  } catch (error) {
    console.error("Delete product error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to delete product",
    });
  }
};


// 2. Public: ek active product ki details
export const getProductById = async (req, res) => {
  try {
    const { id } = req.params;
    const conditions = [{ slug: id }];

    if (mongoose.Types.ObjectId.isValid(id)) {
      conditions.push({ _id: id });
    }

    const product = await Product.findOne({
      $and: [
        { status: "active" },
        { $or: conditions },
      ],
    }).populate("category", "name slug");

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: product,
    });
  } catch (error) {
    console.error("Get product error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch product",
    });
  }
};

// 3. Admin/client: product create karna
export const createProduct = async (req, res) => {
  try {
    const {
      name,
      slug,
      category,
      price,
      originalPrice,
      discountPercentage,
      brand,
      shortDescription,
      fullDescription,
      features,
      specs,
      images,
      availableSizes,
      availableColors,
      stockCount,
      inStock,
      isNewProduct,
      isBestSeller,
    } = req.body;

    if (!name || !slug || !category || price === undefined) {
      return res.status(400).json({
        success: false,
        message: "Name, slug, category and price are required",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(category)) {
      return res.status(400).json({
        success: false,
        message: "Invalid category ID",
      });
    }

    const categoryExists = await Category.findOne({
      _id: category,
      isActive: true,
    });

    if (!categoryExists) {
      return res.status(400).json({
        success: false,
        message: "Category does not exist or is inactive",
      });
    }

    if (
      typeof price !== "number" ||
      !Number.isFinite(price) ||
      price < 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Price must be a valid non-negative number",
      });
    }

    // Owner aur status client ke request body se nahi lenge.
    const productData = {
      name,
      slug,
      category: categoryExists._id,
      owner: req.user.id,
      status: req.user.role === "admin" ? "active" : "pending",
      price,
    };

    // Sirf allowed fields hi save hongi.
    const optionalFields = {
      originalPrice,
      discountPercentage,
      brand,
      shortDescription,
      fullDescription,
      features,
      specs,
      images,
      availableSizes,
      availableColors,
      stockCount,
      inStock,
      isNewProduct,
      isBestSeller,
    };

    for (const [key, value] of Object.entries(optionalFields)) {
      if (value !== undefined) {
        productData[key] = value;
      }
    }

    const product = await Product.create(productData);

    return res.status(201).json({
      success: true,
      message:
        product.status === "active"
          ? "Product created successfully"
          : "Product submitted for admin approval",
      data: product,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Product slug already exists",
      });
    }

    if (error.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    console.error("Create product error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to create product",
    });
  }
};

// 4. Admin/client: apne products dekhna
export const getMyProducts = async (req, res) => {
  try {
    const filter =
      req.user.role === "admin"
        ? {}
        : { owner: req.user.id };

    const products = await Product.find(filter)
      .populate("category", "name slug")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      data: products,
      total: products.length,
    });
  } catch (error) {
    console.error("Get my products error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch your products",
    });
  }
};


export const reviewProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID",
      });
    }

    if (!["active", "rejected"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Status must be active or rejected",
      });
    }

    const product = await Product.findByIdAndUpdate(
      id,
      { $set: { status } },
      { new: true, runValidators: true }
    );

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: `Product ${status === "active" ? "approved" : "rejected"} successfully`,
      data: product,
    });
  } catch (error) {
    console.error("Review product error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to review product",
    });
  }
};


export const getAllProductsForAdmin = async (req, res) => {
  try {
    const { status, category, search } = req.query;

    const filter = {};

    if (status && ["pending", "active", "rejected"].includes(status)) {
      filter.status = status;
    }

    if (category && category !== "all") {
      if (!mongoose.Types.ObjectId.isValid(category)) {
        return res.status(400).json({
          success: false,
          message: "Invalid category ID",
        });
      }

      filter.category = category;
    }

    if (search) {
      const safeSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      filter.$or = [
        { name: { $regex: safeSearch, $options: "i" } },
        { brand: { $regex: safeSearch, $options: "i" } },
        { slug: { $regex: safeSearch, $options: "i" } },
      ];
    }

    const products = await Product.find(filter)
      .populate("category", "name slug")
      .populate("owner", "name email")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      data: products,
      total: products.length,
    });
  } catch (error) {
    console.error("Admin products error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch admin products",
    });
  }
};
