const sendWelcomeEmail = require('../emails/sendWelcomeEmail');
const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');

// .env üzerinden değişkenler
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RECAPTCHA_SECRET_KEY = process.env.RECAPTCHA_SECRET_KEY;

// Supabase istemcisi
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // Dinamik import yapıyoruz, ESM uyumluluğu için
  const fetch = (await import('node-fetch')).default;

  try {
    const data = JSON.parse(event.body);
    const { email, token, honey } = data;

    // Honeypot kontrolü
    if (honey && honey.trim() !== '') {
      return { statusCode: 400, body: 'Bot detected.' };
    }

    // reCAPTCHA doğrulama
    const recaptchaRes = await fetch(`https://www.google.com/recaptcha/api/siteverify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `secret=${RECAPTCHA_SECRET_KEY}&response=${token}`,
    });
    const recaptchaJson = await recaptchaRes.json();

    if (!recaptchaJson.success || recaptchaJson.score < 0.5) {
      return { statusCode: 400, body: 'reCAPTCHA failed.' };
    }

    // Benzersiz kod ve tarih üret
    const accessGrantCode = `solo${uuidv4().slice(0, 8)}`;
    const issuedDate = new Date().toISOString().split('T')[0];

    // Supabase'e kayıt
    const { error } = await supabase.from('deepelynx_tickets').insert([
      {
        email,
        access_code: accessGrantCode,
        issued_at: issuedDate,
        ticket_type: 'solo',
      },
    ]);

    if (error) {
      console.error('Supabase error:', error);
      return { statusCode: 500, body: 'Failed to save to database' };
    }

    // Mail gönderimi
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
    console.error('Function error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Server error' }),
    };
  }
};
