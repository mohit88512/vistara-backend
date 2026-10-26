
import Cart from "../models/cart.js";
import Product from "../models/product.js";

export const addToCart = async (req, res) => {
  try {
    const { productId, quantity = 1 } = req.body;
    const userId = req.user.id;

    // Validate product ID
    if (!productId || !/^[0-9a-fA-F]{24}$/.test(productId)) {
      return res.status(400).json({
        success: false,
        message: "Valid product ID is required",
      });
    }

    // Validate quantity
    if (
      !Number.isInteger(quantity) ||
      quantity < 1
    ) {
      return res.status(400).json({
        success: false,
        message: "Quantity must be a positive integer",
      });
    }

    // Find an active product
    const product = await Product.findOne({
      _id: productId,
      status: "active",
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found or unavailable",
      });
    }

    // Check stock availability
    if (!product.inStock || product.stockCount < quantity) {
      return res.status(400).json({
        success: false,
        message: "Requested quantity is not available in stock",
      });
    }

    // Find or create the user's cart
    let cart = await Cart.findOne({ user: userId });

    if (!cart) {
      cart = new Cart({
        user: userId,
        items: [],
      });
    }

    // Add quantity if product already exists
    const existingItem = cart.items.find(
      (item) => item.product.toString() === productId
    );

    const newQuantity = existingItem
      ? existingItem.quantity + quantity
      : quantity;

    if (newQuantity > product.stockCount) {
      return res.status(400).json({
        success: false,
        message: `Only ${product.stockCount} units are available`,
      });
    }

    if (existingItem) {
      existingItem.quantity = newQuantity;
    } else {
      cart.items.push({
        product: productId,
        quantity,
      });
    }

    await cart.save();

    // Return populated cart
    cart = await Cart.findById(cart._id).populate(
      "items.product",
      "name slug price images stockCount inStock status"
    );

    return res.status(200).json({
      success: true,
      message: "Product added to cart successfully",
      data: cart,
    });
  } catch (error) {
    console.error("Add to cart error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to add product to cart",
    });
  }
};


export const getMyCart = async (req, res) => {
  try {
    const userId = req.user.id;

    const cart = await Cart.findOne({ user: userId }).populate(
      "items.product",
      "name slug brand price images stockCount inStock status"
    );

    if (!cart) {
      return res.status(200).json({
        success: true,
        message: "Your cart is empty",
        data: {
          items: [],
          totalItems: 0,
          totalAmount: 0,
        },
      });
    }

    let totalItems = 0;
    let totalAmount = 0;

    const items = cart.items.map((item) => {
      const product = item.product;

      // Product may have been deleted after being added to cart.
      if (!product) {
        return {
          product: null,
          quantity: item.quantity,
          subtotal: 0,
          available: false,
        };
      }

      const subtotal = product.price * item.quantity;

      totalItems += item.quantity;
      totalAmount += subtotal;

      return {
        product,
        quantity: item.quantity,
        subtotal,
        available:
          product.status === "active" &&
          product.inStock &&
          product.stockCount >= item.quantity,
      };
    });

    return res.status(200).json({
      success: true,
      data: {
        _id: cart._id,
        items,
        totalItems,
        totalAmount,
      },
    });
  } catch (error) {
    console.error("Get cart error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch cart",
    });
  }
};


export const updateCartQuantity = async (req, res) => {
  try {
    const { productId, quantity } = req.body;
    const userId = req.user.id;

    if (!productId || !/^[0-9a-fA-F]{24}$/.test(productId)) {
      return res.status(400).json({
        success: false,
        message: "Valid product ID is required",
      });
    }

    if (!Number.isInteger(quantity) || quantity < 1) {
      return res.status(400).json({
        success: false,
        message: "Quantity must be a positive integer",
      });
    }

    const product = await Product.findOne({
      _id: productId,
      status: "active",
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found or unavailable",
      });
    }

    if (!product.inStock || product.stockCount < quantity) {
      return res.status(400).json({
        success: false,
        message: `Only ${product.stockCount} units are available`,
      });
    }

    const cart = await Cart.findOne({ user: userId });

    if (!cart) {
      return res.status(404).json({
        success: false,
        message: "Cart not found",
      });
    }

    const item = cart.items.find(
      (item) => item.product.toString() === productId
    );

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Product not found in cart",
      });
    }

    item.quantity = quantity;
    await cart.save();

    const updatedCart = await Cart.findById(cart._id).populate(
      "items.product",
      "name slug brand price images stockCount inStock status"
    );

    return res.status(200).json({
      success: true,
      message: "Cart quantity updated successfully",
      data: updatedCart,
    });
  } catch (error) {
    console.error("Update cart quantity error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update cart quantity",
    });
  }
};


export const removeFromCart = async (req, res) => {
  try {
    const { productId } = req.params;
    const userId = req.user.id;

    if (!productId || !/^[0-9a-fA-F]{24}$/.test(productId)) {
      return res.status(400).json({
        success: false,
        message: "Valid product ID is required",
      });
    }

    const cart = await Cart.findOne({ user: userId });

    if (!cart) {
      return res.status(404).json({
        success: false,
        message: "Cart not found",
      });
    }

    const itemExists = cart.items.some(
      (item) => item.product.toString() === productId
    );

    if (!itemExists) {
      return res.status(404).json({
        success: false,
        message: "Product not found in cart",
      });
    }

    cart.items = cart.items.filter(
      (item) => item.product.toString() !== productId
    );

    await cart.save();

    return res.status(200).json({
      success: true,
      message: "Product removed from cart successfully",
      data: cart,
    });
  } catch (error) {
    console.error("Remove from cart error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to remove product from cart",
    });
  }
};


export const clearCart = async (req, res) => {
  try {
    const userId = req.user.id;

    const cart = await Cart.findOne({ user: userId });

    if (!cart) {
      return res.status(404).json({
        success: false,
        message: "Cart not found",
      });
    }

    cart.items = [];
    await cart.save();

    return res.status(200).json({
      success: true,
      message: "Cart cleared successfully",
      data: cart,
    });
  } catch (error) {
    console.error("Clear cart error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to clear cart",
    });
  }
};
