import Cookies from "./cookies";

function randomStr(length) {
  var randomChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  var result = '';
  for ( var i = 0; i < length; i++ ) {
      result += randomChars.charAt(Math.floor(Math.random() * randomChars.length));
  }
  return result;
}

async function getUid() {

  if (Cookies.get('uid')) return Cookies.get('uid');
  
  const { ip_address } = await fetch('https://ipgeolocation.abstractapi.com/v1/?api_key=fbd6af3c2e144315889e022edff639a1');
  //console.log('ip', ip_address);
  const uid = btoa(ip_address) + randomStr(7);
  
  Cookies.set('uid', uid);
  return uid;

}

export default getUid;
