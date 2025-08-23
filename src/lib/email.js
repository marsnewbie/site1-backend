import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export const emailService = {
  // Send order confirmation email
  sendOrderConfirmation: async (orderData) => {
    const { contact, orderId, totalPence, cartItems, mode } = orderData;
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Order Confirmation</h2>
        <p>Dear ${contact.name},</p>
        <p>Thank you for your order! Your order number is: <strong>${orderId}</strong></p>
        
        <h3>Order Details:</h3>
        <ul>
          ${cartItems.map(item => `
            <li>${item.qty} × ${item.name} - £${(item.price * item.qty / 100).toFixed(2)}</li>
          `).join('')}
        </ul>
        
        <p><strong>Total: £${(totalPence / 100).toFixed(2)}</strong></p>
        <p><strong>Mode: ${mode}</strong></p>
        
        <p>We'll notify you when your order is ready for ${mode === 'delivery' ? 'delivery' : 'collection'}.</p>
        
        <p>Best regards,<br>Your Takeaway Team</p>
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
