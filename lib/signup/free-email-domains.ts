/**
 * Consumer and disposable mail domains that may not start a signup.
 *
 * This is a qualification measure, not a security control. A blocklist never
 * catches every free provider, and anyone determined can register a domain for
 * a few dollars. It stops the Gmail and Hotmail signups, which is the whole
 * intent — the product is sold to agencies, and the domain they trade under is
 * the cheapest available signal that one is on the other end.
 */
export const FREE_EMAIL_DOMAINS = new Set([
  // Major consumer providers
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'yahoo.com.au',
  'yahoo.ca', 'yahoo.co.in', 'ymail.com', 'rocketmail.com',
  'hotmail.com', 'hotmail.co.uk', 'hotmail.com.au', 'hotmail.fr',
  'outlook.com', 'outlook.com.au', 'live.com', 'live.com.au', 'live.co.uk',
  'msn.com', 'passport.com',
  'icloud.com', 'me.com', 'mac.com',
  'aol.com', 'aim.com',
  'proton.me', 'protonmail.com', 'pm.me',
  'zoho.com', 'gmx.com', 'gmx.net', 'gmx.de', 'web.de',
  'mail.com', 'email.com', 'inbox.com', 'fastmail.com', 'hushmail.com',
  'yandex.com', 'yandex.ru', 'mail.ru', 'qq.com', '163.com', '126.com',
  'naver.com', 'daum.net', 'seznam.cz', 'libero.it', 'orange.fr', 'free.fr',
  'wanadoo.fr', 'laposte.net', 't-online.de', 'bluewin.ch', 'telstra.com',
  'bigpond.com', 'bigpond.net.au', 'optusnet.com.au', 'iinet.net.au',
  'xtra.co.nz', 'rogers.com', 'sympatico.ca', 'shaw.ca', 'comcast.net',
  'verizon.net', 'att.net', 'sbcglobal.net', 'bellsouth.net', 'cox.net',
  'charter.net', 'earthlink.net', 'juno.com', 'netzero.net',

  // Disposable and throwaway
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.net', '10minutemail.com',
  'temp-mail.org', 'tempmail.com', 'throwawaymail.com', 'yopmail.com',
  'trashmail.com', 'sharklasers.com', 'getnada.com', 'maildrop.cc',
  'dispostable.com', 'fakeinbox.com', 'mailnesia.com', 'mintemail.com',
  'spamgourmet.com', 'tempr.email', 'moakt.com', 'emailondeck.com',
  'mohmal.com', 'burnermail.io', 'anonaddy.com', 'simplelogin.io',
  'duck.com', 'relay.firefox.com',
])
