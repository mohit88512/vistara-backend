
import express from "express";
import { adminOnly} from "../middleware/admin.middleware.js";

import {
  getProducts,
  getProductById,
  createProduct,
  getMyProducts,
  updateProduct,
  deleteProduct,
  reviewProduct,
  getAllProductsForAdmin,
} from "../controllers/product.controller.js";

import { protect } from "../middleware/auth.middleware.js";
import { allowRoles } from "../middleware/role.middleware.js";

const router = express.Router();

// Public routes
router.get("/", getProducts);

// Private routes — static route first
router.get(
  "/my-products",
  protect,
  allowRoles("admin", "client"),
  getMyProducts
);

router.post(
  "/",
  protect,
  allowRoles("admin", "client"),
  createProduct
);

router.patch(
  "/:id",
  protect,
  allowRoles("admin", "client"),
  updateProduct
);

router.delete(
  "/:id",
  protect,
  allowRoles("admin", "client"),
  deleteProduct
);

router.patch(
  "/:id/review",
  protect,
  adminOnly,
  reviewProduct
);


router.get(
  "/admin/all",
  protect,
  adminOnly,
  getAllProductsForAdmin
);

// Dynamic route last
router.get("/:id", getProductById);

export default router;
