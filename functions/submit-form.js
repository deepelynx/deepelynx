const sendWelcomeEmail = require('../emails/sendWelcomeEmail');
const { createClient } = require('@supabase/supabase-js');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const { v4: uuidv4 } = require('uuid');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  try {
    const data = JSON.parse(event.body);
    const { email, name, honey, token } = data;

    // Temel validasyonlar
    if (!name || name.trim() === '') {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Name is required.' }),
      };
    }
    if (!email || email.trim() === '') {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Email is required.' }),
      };
    }

    // Honeypot kontrolü
    if (honey && honey.trim() !== '') {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Bot detected (honeypot).' }),
      };
    }

    // reCAPTCHA doğrulama
    if (!token) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'reCAPTCHA token missing.' }),
      };
    }
    const recaptchaRes = await fetch(`https://www.google.com/recaptcha/api/siteverify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `secret=${process.env.RECAPTCHA_SECRET_KEY}&response=${token}`,
    });
    const recaptchaJson = await recaptchaRes.json();
    if (!recaptchaJson.success || (recaptchaJson.score && recaptchaJson.score < 0.5)) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'reCAPTCHA verification failed.' }),
      };
    }

    // Access code ve tarih üret
    const accessGrantCode = `solo${uuidv4().slice(0, 8)}`;
    const issuedDate = new Date().toISOString().split('T')[0];

    // Veritabanına kayıt
    const { error } = await supabase.from('deepelynx_tickets').insert([
      {
        name,
        email,
        ticket_code: accessGrantCode,
        issued_at: issuedDate,
        ticket_type: 'solo',
      },
    ]);

    if (error) {
      console.error('Supabase error:', error);
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Failed to save to database' }),
      };
    }

    // Hoşgeldin maili gönderimi
    await sendWelcomeEmail({
      to: email,
      accessGrantCode,
      issuedDate,
      inviteLink: 'https://deepelynx.io/access',
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Success', accessGrantCode }),
    };
  } catch (err) {
    console.error('Function error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Server error' }),
    };
  }
};
