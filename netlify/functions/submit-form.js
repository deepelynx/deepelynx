const fetch = require('node-fetch');
const { v4: uuidv4 } = require('uuid');

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_API_KEY = process.env.SUPABASE_API_KEY || '';
const RECAPTCHA_SECRET = process.env.RECAPTCHA_SECRET || '';

function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(String(email).toLowerCase());
}

exports.handler = async function(event) {
  console.log("✅ Function executed!");

  if (event.httpMethod === 'GET') {
    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Deepelynx backend is alive!" }),
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ message: "Method Not Allowed" }),
    };
  }

  let data;
  try {
    data = JSON.parse(event.body);
  } catch (e) {
    console.error('❌ JSON parse error:', e);
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'Invalid JSON' }),
    };
  }

  const { name, email, referral_code, token } = data;

  if (!name || !email || !token) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'Missing required fields' }),
    };
  }

  if (!validateEmail(email)) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'Invalid email format' }),
    };
  }

  // Verify reCAPTCHA token
  try {
    const captchaResp = await fetch(`https://www.google.com/recaptcha/api/siteverify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `secret=${RECAPTCHA_SECRET}&response=${token}`,
    });

    const captchaData = await captchaResp.json();
    if (!captchaData.success || captchaData.score < 0.5) {
      return {
        statusCode: 403,
        body: JSON.stringify({ message: 'Failed reCAPTCHA verification' }),
      };
    }
  } catch (e) {
    console.error('❌ reCAPTCHA verification error:', e);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'reCAPTCHA verification failed' }),
    };
  }

  // Check if user already exists
  try {
    const checkRes = await fetch(`${SUPABASE_URL}/rest/v1/deepelynx_tickets?email=eq.${encodeURIComponent(email)}`, {
      headers: {
        apikey: SUPABASE_API_KEY,
        Authorization: `Bearer ${SUPABASE_API_KEY}`,
        Accept: 'application/json',
      },
    });

    if (!checkRes.ok) {
      const err = await checkRes.text();
      console.error("❌ Error checking existing user:", err);
      return {
        statusCode: 500,
        body: JSON.stringify({ message: 'Error checking existing user' }),
      };
    }

    const existingUsers = await checkRes.json();
    if (existingUsers.length > 0) {
      return {
        statusCode: 409,
        body: JSON.stringify({ message: 'Email already registered' }),
      };
    }
  } catch (e) {
    console.error('❌ Error during user check:', e);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Error verifying existing user' }),
    };
  }

  // Generate new codes and insert user
  const ticket_code = uuidv4().split('-')[0].toUpperCase();
  const referral_code_generated = uuidv4().split('-')[1].toUpperCase();
  const referral_link = `https://deepelynx.com/?ref=${referral_code_generated}`;

  try {
    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/deepelynx_tickets`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_API_KEY,
        Authorization: `Bearer ${SUPABASE_API_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        name,
        email,
        referral_code: referral_code_generated,
        referred_by: referral_code || null,
        ticket_code,
        referral_link,
        has_bonus: false,
        ticket_type: 'SOLO',
        created_at: new Date().toISOString(),
      }),
    });

    if (!insertRes.ok) {
      const errorText = await insertRes.text();
      console.error('❌ Error inserting user:', errorText);
      return {
        statusCode: 500,
        body: JSON.stringify({ message: 'Error inserting user', error: errorText }),
      };
    }

    const user = await insertRes.json();

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'User registered successfully',
        referral_link,
        ticket_code,
        referral_code: referral_code_generated,
        user,
      }),
    };

  } catch (e) {
    console.error('❌ Fetch error inserting user:', e);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Error inserting user', error: e.message }),
    };
  }
};
