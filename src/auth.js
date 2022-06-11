import Cookies from "./cookies";

async function getUid() {

  if (Cookies.get('uid')) return Cookies.get('uid');
  
  const { ip_address } = await fetch('https://ipgeolocation.abstractapi.com/v1/?api_key=fbd6af3c2e144315889e022edff639a1');
  const uid = btoa(ip_address);
  
  Cookies.set('uid', uid);
  return uid;

}

export default getUid;