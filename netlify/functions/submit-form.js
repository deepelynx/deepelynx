const fetch = require('node-fetch');
const { v4: uuidv4 } = require('uuid');

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_API_KEY = process.env.SUPABASE_API_KEY || '';
const RECAPTCHA_SECRET = process.env.RECAPTCHA_SECRET || '';

// Email format kontrolü
function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(String(email).toLowerCase());
}

exports.handler = async function (event, context) {
  if (event.httpMethod === 'GET') {
    // Test endpoint
    if (event.queryStringParameters && event.queryStringParameters.hello === 'true') {
      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'Hello from Deepelynx backend!' }),
      };
    }
    return {
      statusCode: 404,
      body: JSON.stringify({ message: 'Not found' }),
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ message: 'Method Not Allowed' }),
    };
  }

  let data;
  try {
    data = JSON.parse(event.body);
  } catch (e) {
    return {
      statusCode: 400,
      body: JSON.stringify({ success: false, message: 'Invalid JSON' }),
    };
  }

  const { name, email, referral_code, token } = data;

  // Temel validasyonlar
  if (!name || !email || !token) {
    return {
      statusCode: 400,
      body: JSON.stringify({ success: false, message: 'Missing required fields: name, email, or token.' }),
    };
  }

  if (!validateEmail(email)) {
    return {
      statusCode: 400,
      body: JSON.stringify({ success: false, message: 'Invalid email format.' }),
    };
  }

  // reCAPTCHA doğrulaması
  try {
    const recaptchaResp = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `secret=${encodeURIComponent(RECAPTCHA_SECRET)}&response=${encodeURIComponent(token)}`,
    });
    const recaptchaJson = await recaptchaResp.json();

    if (!recaptchaJson.success) {
      return {
        statusCode: 403,
        body: JSON.stringify({ success: false, message: 'reCAPTCHA verification failed.' }),
      };
    }
    // Opsiyonel skor kontrolü (reCAPTCHA v3 için)
    if (recaptchaJson.score !== undefined && recaptchaJson.score < 0.5) {
      return {
        statusCode: 403,
        body: JSON.stringify({ success: false, message: 'reCAPTCHA score too low.' }),
      };
    }
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, message: 'Error verifying reCAPTCHA: ' + err.message }),
    };
  }

  // Kullanıcı var mı kontrolü
  let existingUsers;
  try {
    const checkUser = await fetch(`${SUPABASE_URL}/rest/v1/users?email=eq.${encodeURIComponent(email)}`, {
      headers: {
        apikey: SUPABASE_API_KEY,
        Authorization: `Bearer ${SUPABASE_API_KEY}`,
        Accept: 'application/json',
      },
    });

    if (!checkUser.ok) {
      const errText = await checkUser.text();
      return {
        statusCode: 500,
        body: JSON.stringify({ success: false, message: 'Error checking existing user: ' + errText }),
      };
    }
    existingUsers = await checkUser.json();
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, message: 'Exception checking user: ' + err.message }),
    };
  }

  if (existingUsers.length > 0) {
    return {
      statusCode: 409,
      body: JSON.stringify({ success: false, message: 'Email already registered.' }),
    };
  }

  // Yeni ticket kodu üret
  const ticket_code = uuidv4().split('-')[0].toUpperCase();

  // Referral link oluştur
  const referral_link = `https://deepelynx.com/?ref=${ticket_code}`;

  // Kullanıcıyı ekle
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
      const errText = await insertResp.text();
      return {
        statusCode: 500,
        body: JSON.stringify({ success: false, message: 'Error inserting user: ' + errText }),
      };
    }
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, message: 'Exception inserting user: ' + err.message }),
    };
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      success: true,
      message: 'User registered successfully.',
      ticket_code,
      referral_link,
    }),
  };
};
