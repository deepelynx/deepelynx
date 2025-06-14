const sendWelcomeEmail = require('../emails/sendWelcomeEmail');
const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RECAPTCHA_SECRET_KEY = process.env.RECAPTCHA_SECRET_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  // node-fetch ES Module uyumluluğu için dinamik import
  const fetch = (await import('node-fetch')).default;

  try {
    const data = JSON.parse(event.body);
    const { email, token, honey } = data;

    if (!email || !token) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing email or token' }) };
    }

    if (honey && honey.trim() !== '') {
      return { statusCode: 400, body: JSON.stringify({ error: 'Bot detected.' }) };
    }

    const recaptchaRes = await fetch(`https://www.google.com/recaptcha/api/siteverify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `secret=${RECAPTCHA_SECRET_KEY}&response=${token}`,
    });

    const recaptchaJson = await recaptchaRes.json();

    if (!recaptchaJson.success || recaptchaJson.score < 0.5) {
      return { statusCode: 400, body: JSON.stringify({ error: 'reCAPTCHA failed.' }) };
    }

    const accessGrantCode = `solo${uuidv4().slice(0, 8)}`;
    const issuedDate = new Date().toISOString().split('T')[0];

    const { error } = await supabase.from('deepelynx_tickets').insert([
      {
        email,
        access_code: accessGrantCode,
        issued_at: issuedDate,
        ticket_type: 'solo',
      },
    ]);

    if (error) {
      console.error('Supabase insert error:', error);
      return { statusCode: 500, body: JSON.stringify({ error: 'Database error' }) };
    }

    await sendWelcomeEmail({
      to: email,
      accessGrantCode,
      issuedDate,
      inviteLink: 'https://deepelynx.io/access',
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Success' }),
    };
  } catch (err) {
    console.error('Function caught error:', err, err.stack);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Server error' }),
    };
  }
};
