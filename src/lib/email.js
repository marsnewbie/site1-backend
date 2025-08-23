import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export const emailService = {
  // Send order confirmation email
  sendOrderConfirmation: async (orderData) => {
    const { contact, orderId, totalPence, cartItems, mode, subtotalPence, deliveryFeePence, discountPence, comment } = orderData;
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Order Confirmation - China Palace</h2>
        <p>Dear ${contact.name},</p>
        <p>Thank you for your order! Your order number is: <strong>${orderId}</strong></p>
        
        <h3>Order Details:</h3>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr style="background-color: #f5f5f5;">
            <th style="padding: 10px; text-align: left; border: 1px solid #ddd;">Item</th>
            <th style="padding: 10px; text-align: center; border: 1px solid #ddd;">Qty</th>
            <th style="padding: 10px; text-align: right; border: 1px solid #ddd;">Price</th>
            <th style="padding: 10px; text-align: right; border: 1px solid #ddd;">Total</th>
          </tr>
          ${cartItems.map(item => `
            <tr>
              <td style="padding: 10px; border: 1px solid #ddd;">${item.name}</td>
              <td style="padding: 10px; text-align: center; border: 1px solid #ddd;">${item.qty}</td>
              <td style="padding: 10px; text-align: right; border: 1px solid #ddd;">£${(item.price / 100).toFixed(2)}</td>
              <td style="padding: 10px; text-align: right; border: 1px solid #ddd;">£${(item.price * item.qty / 100).toFixed(2)}</td>
            </tr>
          `).join('')}
        </table>
        
        <div style="text-align: right; margin: 20px 0;">
          <p><strong>Sub-Total: £${(subtotalPence / 100).toFixed(2)}</strong></p>
          ${deliveryFeePence > 0 ? `<p><strong>Delivery Fee: £${(deliveryFeePence / 100).toFixed(2)}</strong></p>` : ''}
          ${discountPence > 0 ? `<p><strong>Discount: -£${(discountPence / 100).toFixed(2)}</strong></p>` : ''}
          <p style="font-size: 18px;"><strong>Total: £${(totalPence / 100).toFixed(2)}</strong></p>
        </div>
        
        <p><strong>Mode: ${mode === 'delivery' ? 'Delivery' : 'Collection'}</strong></p>
        ${comment ? `<p><strong>Comment:</strong> ${comment}</p>` : ''}
        
        <p>We'll notify you when your order is ready for ${mode === 'delivery' ? 'delivery' : 'collection'}.</p>
        
        <p>Best regards,<br>China Palace Team</p>
      </div>
    `;

    try {
      const { data, error } = await resend.emails.send({
        from: 'orders@your-takeaway.com',
        to: contact.email,
        subject: `Order Confirmation - ${orderId}`,
        html: html,
      });

      if (error) {
        console.error('Email send error:', error);
        return { success: false, error };
      }

      return { success: true, data };
    } catch (error) {
      console.error('Email service error:', error);
      return { success: false, error };
    }
  },

  // Send order status update
  sendOrderUpdate: async (orderData, status) => {
    const { contact, orderId } = orderData;
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Order Status Update</h2>
        <p>Dear ${contact.name},</p>
        <p>Your order <strong>${orderId}</strong> status has been updated to: <strong>${status}</strong></p>
        
        <p>Best regards,<br>Your Takeaway Team</p>
      </div>
    `;

    try {
      const { data, error } = await resend.emails.send({
        from: 'orders@your-takeaway.com',
        to: contact.email,
        subject: `Order Update - ${orderId}`,
        html: html,
      });

      if (error) {
        console.error('Email send error:', error);
        return { success: false, error };
      }

      return { success: true, data };
    } catch (error) {
      console.error('Email service error:', error);
      return { success: false, error };
    }
  }
};
