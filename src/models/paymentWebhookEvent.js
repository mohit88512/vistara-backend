
import mongoose from "mongoose";

const paymentWebhookEventSchema = new mongoose.Schema(
  {
    eventId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    eventType: {
      type: String,
      required: true,
    },

    processed: {
      type: Boolean,
      default: false,
    },

    processedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

const PaymentWebhookEvent =
  mongoose.models.PaymentWebhookEvent ||
  mongoose.model("PaymentWebhookEvent", paymentWebhookEventSchema);

export default PaymentWebhookEvent;
