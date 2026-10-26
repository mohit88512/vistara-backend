import Category from "../models/categories.js";

// Admin: Create category
export const createCategory = async (req, res) => {
  try {
    const { name, slug, description } = req.body;

    if (!name?.trim() || !slug?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Category name and slug are required",
      });
    }

    const category = await Category.create({
      name: name.trim(),
      slug: slug.trim().toLowerCase(),
      description: description?.trim() || "",
    });

    return res.status(201).json({
      success: true,
      message: "Category created successfully",
      data: category,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Category slug already exists",
      });
    }

    if (error.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    console.error("Create category error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to create category",
    });
  }
};

// Public: Get active categories
export const getCategories = async (req, res) => {
  try {
    const categories = await Category.find({ isActive: true })
      .sort({ name: 1 });

    return res.status(200).json({
      success: true,
      total: categories.length,
      data: categories,
    });
  } catch (error) {
    console.error("Get categories error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch categories",
    });
  }
};

// Admin: Get all categories, including inactive
export const getAllCategories = async (req, res) => {
  try {
    const categories = await Category.find().sort({ name: 1 });

    return res.status(200).json({
      success: true,
      total: categories.length,
      data: categories,
    });
  } catch (error) {
    console.error("Get all categories error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch categories",
    });
  }
};

// Admin: Update category
export const updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, slug, description, isActive } = req.body;

    const updates = {};

    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim()) {
        return res.status(400).json({
          success: false,
          message: "Category name cannot be empty",
        });
      }

      updates.name = name.trim();
    }

    if (slug !== undefined) {
      if (typeof slug !== "string" || !slug.trim()) {
        return res.status(400).json({
          success: false,
          message: "Category slug cannot be empty",
        });
      }

      updates.slug = slug.trim().toLowerCase();
    }

    if (description !== undefined) {
      if (typeof description !== "string") {
        return res.status(400).json({
          success: false,
          message: "Description must be a string",
        });
      }

      updates.description = description.trim();
    }

    if (isActive !== undefined) {
      if (typeof isActive !== "boolean") {
        return res.status(400).json({
          success: false,
          message: "isActive must be true or false",
        });
      }

      updates.isActive = isActive;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        message: "Provide valid fields to update",
      });
    }

    const category = await Category.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Category updated successfully",
      data: category,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Category slug already exists",
      });
    }

    if (
      error.name === "ValidationError" ||
      error.name === "CastError"
    ) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    console.error("Update category error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to update category",
    });
  }
};