const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

function generateReferralCode(length = 6) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

async function sendWelcomeEmail(email, name, referralLink) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('Resend API key missing');

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: 'Deepelynx <noreply@deepelynx.com>',
      to: email,
      subject: "You're in! Welcome to Deepelynx 🚀",
      html: `
        <div style="font-family: sans-serif; padding: 20px;">
          <h2>Hi ${name},</h2>
          <p>Welcome to the Deepelynx transformation circle.</p>
          <p>You've received <strong>1 Quantum Solo Ticket</strong> granting you access to our exclusive launch.</p>
          <p>Share your invite link with 2 friends. When both join through your link, you’ll unlock <strong>2 additional Quantum Solo Tickets</strong> to further enhance your journey.</p>
          <p><a href="${referralLink}" style="color: #007bff;">${referralLink}</a></p>
          <p>We are building the future together — your presence means everything to us.<br>— Team Deepelynx</p>
        </div>`,
    }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    console.error('Email error:', data);
    throw new Error('Failed to send welcome email');
  }

  return res.json();
}

async function verifyRecaptcha(token) {
  const secret = process.env.RECAPTCHA_SECRET;
  if (!secret) throw new Error('reCAPTCHA secret missing');
  if (!token) return false;

  const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `secret=${encodeURIComponent(secret)}&response=${encodeURIComponent(token)}`,
  });

  if (!res.ok) return false;

  const data = await res.json();
  return data.success && data.score > 0.5;
}

exports.handler = async function (event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ message: 'Method Not Allowed' }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ success: false, message: 'Invalid JSON' }),
    };
  }

  const { email, name, ticket_type, referral_code: referredBy, recaptcha_token } = body;

  if (!email || !name || !ticket_type) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ success: false, message: 'Email, name and ticket type are required.' }),
    };
  }

  try {
    const isHuman = await verifyRecaptcha(recaptcha_token);
    if (!isHuman) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'reCAPTCHA verification failed.' }),
      };
    }
  } catch (err) {
    console.error('reCAPTCHA error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, message: 'reCAPTCHA verification error.' }),
    };
  }

  try {
    // Email zaten kayıtlı mı kontrol et
    const { data: existingUser, error: existingUserError } = await supabase
      .from('deepelynx_tickets')
      .select('email')
      .eq('email', email)
      .maybeSingle();

    if (existingUserError) throw existingUserError;

    if (existingUser) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'Email already registered.' }),
      };
    }

    // Referral kodu benzersiz oluştur
    let newReferralCode;
    let isUnique = false;
    while (!isUnique) {
      newReferralCode = generateReferralCode();
      const { data: existingCodes, error } = await supabase
        .from('referal_tracking')
        .select('referral_code')
        .eq('referral_code', newReferralCode);

      if (error) throw error;

      if (!existingCodes || existingCodes.length === 0) isUnique = true;
    }

    // Referral varsa kontrol ve güncelleme
    if (referredBy) {
      const { data: referrer, error: refError } = await supabase
        .from('referal_tracking')
        .select('user_id, referral_count, referral_active, ticket_count, ticket_type')
        .eq('referral_code', referredBy)
        .maybeSingle();

      if (refError) throw refError;

      if (!referrer) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ success: false, message: 'Invalid referral code.' }),
        };
      }

      if (!referrer.referral_active || referrer.referral_count >= 2) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ success: false, message: 'Referral code expired or limit reached.' }),
        };
      }

      // Bilet tipi eşleşme kontrolü
      if (referrer.ticket_type === ticket_type) {
        const newReferralCount = referrer.referral_count + 1;
        const updatedReferralActive = newReferralCount >= 2 ? false : true;
        const updatedTicketCount = newReferralCount === 2 ? referrer.ticket_count + 2 : referrer.ticket_count;

        const { error: updateError } = await supabase
          .from('referal_tracking')
          .update({
            referral_count: newReferralCount,
            referral_active: updatedReferralActive,
            ticket_count: updatedTicketCount,
          })
          .eq('user_id', referrer.user_id);

        if (updateError) throw updateError;
      }
    }

    const referralLink = `https://deepelynx.com/r/${newReferralCode}`;

    // Yeni kullanıcıyı tickets tablosuna ekle
    const { error: insertError } = await supabase.from('deepelynx_tickets').insert({
      email,
      name,
      ticket_type,
      ticket_count: 1,
      referral_code: newReferralCode,
      referral_link: referralLink,
      referral_count: 0,
      referral_active: true,
      referred_by: referredBy || null,
    });

    if (insertError) throw insertError;

    // Hoş geldin maili gönder
    await sendWelcomeEmail(email, name, referralLink);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Registration successful, welcome!',
        referral_link: referralLink,
        ticket_count: 1,
      }),
    };
  } catch (error) {
    console.error('Server error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, message: 'Server error.', error: error.message }),
    };
  }
};
