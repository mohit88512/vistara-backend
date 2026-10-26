import express from "express";

import {
  createCategory,
  getCategories,
  getAllCategories,
  updateCategory,
} from "../controllers/category.controller.js";

import { protect } from "../middleware/auth.middleware.js";
import { adminOnly } from "../middleware/admin.middleware.js";

const router = express.Router();

// Public: Active categories only
router.get("/", getCategories);

// Admin: All categories
router.get("/admin", protect, adminOnly, getAllCategories);

// Admin: Create category
router.post("/", protect, adminOnly, createCategory);

// Admin: Update or deactivate category
router.patch("/:id", protect, adminOnly, updateCategory);

export default router;