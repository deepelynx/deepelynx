const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event) => {
  try {
    if (!event.body) {
      return {
        statusCode: 400,
        body: JSON.stringify({ success: false, message: 'Missing request body.' }),
      };
    }

    const { name, email, token, referral_code } = JSON.parse(event.body);

    if (!name || !email || !token) {
      return {
        statusCode: 400,
        body: JSON.stringify({ success: false, message: 'Required fields are missing.' }),
      };
    }

    // Verify reCAPTCHA
    const recaptchaRes = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `secret=${process.env.RECAPTCHA_SECRET}&response=${token}`,
    });

    const recaptchaData = await recaptchaRes.json();

    if (!recaptchaData.success || recaptchaData.score < 0.5) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          message: 'Suspicious activity detected. Please try again.',
        }),
      };
    }

    // Generate unique codes
    const ticket_code = Math.random().toString(36).substring(2, 10).toUpperCase();
    const new_referral_code = Math.random().toString(36).substring(2, 10).toUpperCase();

    // Insert into Supabase
    const { data, error } = await supabase
      .from('deepelynx_tickets')
      .insert({
        name,
        email,
        referral_code: new_referral_code,
        referred_by: referral_code || null,
        ticket_code,
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    const referral_link = `https://deepelynx.com?ref=${new_referral_code}`;

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        ticket_code: data.ticket_code,
        referral_link,
      }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        message: error.message || 'An unexpected error occurred.',
      }),
    };
  }
};
