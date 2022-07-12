import Cookies from "./cookies";
import { randomStr } from './utils';

async function getUid() {

  if (Cookies.get('uid')) return Cookies.get('uid');
  
  const { ip_address } = await fetch('https://ipgeolocation.abstractapi.com/v1/?api_key=fbd6af3c2e144315889e022edff639a1');
  //console.log('ip', ip_address);
  const uid = btoa(ip_address) + randomStr(7);
  
  Cookies.set('uid', uid);
  return uid;

}

async function login(email, password) {

  const res = await fetch('http://suryajasper.com:8814/login_user', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

  let body = await res.json();

  if (body.uid)
    return body.uid;

  return body;

}

async function signup(email, password) {

  const res = await fetch('http://suryajasper.com:8814/create_user', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

  let body = await res.json();

  if (body.uid)
    return body.uid;

  return body;

}

export { getUid, login, signup };
