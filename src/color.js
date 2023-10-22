
import { getUid } from './auth';
import { getAlbums } from './spotify';
import { base64ImgHeader } from './utils';
// import colors from '../spotify_accounts/out_algebrainer.json';
// import colors from './data/avg.json';

let colors = [];

async function loadColors(param_uid, use_spotify) {

  if (use_spotify) {
    colors = await getAlbums();
    colors = colors.map((color, i) => Object.assign(color, {id: i}));
    return;
  }

  let uid = param_uid || await getUid();

  let res = await fetch(`http://localhost:8814/get_images?id=${uid}`);

  let body = await res.json();

  colors = body.colors.map((color, i) => {
    return {
      color,
      img: base64ImgHeader(body.imgs[i]),
      id: i,
    };
  });

}

function closestColors(color, colorArr, n=3) {
  
  let mins = [];
  
  for (let i = 0; i < n; i++) mins.push({i: 0, d: 1e99});
  
  for (let i = 0; i < colorArr.length; i++) {
    let [r1, g1, b1, _] = colorArr[i].color;
    let [r2, g2, b2] = color;
    
    const d = ((r2-r1)*0.30)**2 + ((g2-g1)*0.59)**2 + ((b2-b1)*0.11)**2;

    for (let j = 0; j < n; j++) {
      if (d < mins[j].d) {
        mins[j] = {i, d};
        break;
      }
    }
  }

  return mins;
}

function hexToRGB(color) {
  const r = parseInt(color.substr(1,2), 16)
  const g = parseInt(color.substr(3,2), 16)
  const b = parseInt(color.substr(5,2), 16)
  return [r, g, b];
}

function rgbToHsv([r, g, b]) {
  r = r / 255;
  g = g / 255;
  b = b / 255;

  // Find the maximum and minimum values of r, g, b
  let max = Math.max(r, g, b);
  let min = Math.min(r, g, b);
  let delta = max - min;

  // Calculate the hue
  let h;
  if (delta === 0) {
    h = 0;
  } else if (max === r) {
    h = 60 * (((g - b) / delta) % 6);
  } else if (max === g) {
    h = 60 * ((b - r) / delta + 2);
  } else {
    h = 60 * ((r - g) / delta + 4);
  }

  // Calculate the saturation
  let s = max === 0 ? 0 : delta / max;

  // Calculate the value
  let v = max;

  // Return the HSV values as an object
  return {
    h: Math.round(h),
    s: Math.round(s * 100),
    v: Math.round(v * 100)
  };
}

function rgbaObjToCss(obj, changes) {
  const {r, g, b, a} = Object.assign(obj, changes);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function rgbObjToArr(obj) {
  const {r, g, b} = obj;
  return [r, g, b];
}

function rgbArrToObj(arr) {
  let [r, g, b, a] = arr;
  a = a || 1;
  return {r, g, b, a};
}

export { 
  colors, loadColors, closestColors, 
  hexToRGB, rgbToHsv, rgbaObjToCss, rgbObjToArr, rgbArrToObj 
};
