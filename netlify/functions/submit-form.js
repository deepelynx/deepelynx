const fetch = require('node-fetch');
const { v4: uuidv4 } = require('uuid');

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_API_KEY = process.env.SUPABASE_API_KEY || '';
const RECAPTCHA_SECRET = process.env.RECAPTCHA_SECRET || '';

function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(String(email).toLowerCase());
}

exports.handler = async function (event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  // ENV değişkenleri eksikse erken çık
  if (!SUPABASE_URL || !SUPABASE_API_KEY || !RECAPTCHA_SECRET) {
    console.error('❌ Missing env vars:', {
      SUPABASE_URL,
      SUPABASE_API_KEY: SUPABASE_API_KEY ? 'SET' : 'MISSING',
      RECAPTCHA_SECRET: RECAPTCHA_SECRET ? 'SET' : 'MISSING',
    });
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, message: 'Server misconfiguration. Missing env variables.' }),
    };
  }

  if (event.httpMethod === 'GET') {
    if (event.queryStringParameters?.hello === 'true') {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ message: 'Hello from Deepelynx backend!' }),
      };
    }
    return {
      statusCode: 404,
      headers,
      body: JSON.stringify({ message: 'Not found' }),
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ message: 'Method Not Allowed' }),
    };
  }

  // JSON parse
  let data;
  try {
    data = JSON.parse(event.body);
  } catch (e) {
    console.error('❌ JSON parse error:', e);
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ success: false, message: 'Invalid JSON' }),
    };
  }

  const { name, email, referral_code, token } = data;

  if (!name || !email || !token) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ success: false, message: 'Missing required fields' }),
    };
  }

  if (!validateEmail(email)) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ success: false, message: 'Invalid email format' }),
    };
  }

  // reCAPTCHA doğrulama
  try {
    const recaptchaResp = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `secret=${encodeURIComponent(RECAPTCHA_SECRET)}&response=${encodeURIComponent(token)}`,
    });
    const recaptchaJson = await recaptchaResp.json();

    if (!recaptchaJson.success || recaptchaJson.score < 0.5) {
      console.warn('⚠️ reCAPTCHA failed:', recaptchaJson);
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ success: false, message: 'Failed reCAPTCHA verification' }),
      };
    }
  } catch (err) {
    console.error('❌ reCAPTCHA error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, message: 'Error verifying reCAPTCHA' }),
    };
  }

  // Kullanıcı kontrolü
  try {
    const userCheckResp = await fetch(`${SUPABASE_URL}/rest/v1/users?email=eq.${encodeURIComponent(email)}`, {
      headers: {
        apikey: SUPABASE_API_KEY,
        Authorization: `Bearer ${SUPABASE_API_KEY}`,
        Accept: 'application/json',
      },
    });

    if (!userCheckResp.ok) {
      const errorText = await userCheckResp.text();
      console.error('❌ Supabase user check error:', errorText);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ success: false, message: 'Error checking existing user' }),
      };
    }

    const existingUsers = await userCheckResp.json();
    if (existingUsers.length > 0) {
      return {
        statusCode: 409,
        headers,
        body: JSON.stringify({ success: false, message: 'Email already registered' }),
      };
    }
  } catch (err) {
    console.error('❌ Fetch error during user check:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, message: 'Error checking existing user' }),
    };
  }

  // Yeni kullanıcı oluşturma
  const ticket_code = uuidv4().split('-')[0].toUpperCase();
  const referral_link = `https://deepelynx.com/?ref=${ticket_code}`;

  try {
    const insertResp = await fetch(`${SUPABASE_URL}/rest/v1/users`, {
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
        referral_code: referral_code || null,
        ticket_code,
        referral_link,
        created_at: new Date().toISOString(),
      }),
    });

    if (!insertResp.ok) {
      const errorText = await insertResp.text();
      console.error('❌ Supabase insert error:', errorText);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ success: false, message: 'Error inserting user', error: errorText }),
      };
    }
  } catch (err) {
    console.error('❌ Insert fetch error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, message: 'Error inserting user', error: err.message }),
    };
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      success: true,
      message: 'User registered successfully',
      ticket_code,
      referral_link,
    }),
  };
};
