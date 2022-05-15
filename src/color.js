
import colors from '../spotify_accounts/out_algebrainer.json';
// import colors from '../spotify_accounts/out_caroltuu.json';

if (Array.isArray(colors[0]))
  colors = colors.map((color, i) => {
    return {
      color,
      img: `./src/out-thatha/${i}.jpg`,
    };
  });

function closestColor(color) {
  let minD = 1e99;
  let minI = 0;

  for (let i = 0; i < colors.length; i++) {
    let [r1, g1, b1, _] = colors[i].color;
    let [r2, g2, b2] = color;
    
    // const d = ((r2-r1)*0.30)**2 + ((g2-g1)*0.59)**2 + ((b2-b1)*0.11)**2;
    const d = ((r2-r1)*0.30)**2 + ((g2-g1)*0.59)**2 + ((b2-b1)*0.11)**2;
    if (d < minD) {
      minD = d;
      minI = i;
    }
  }

  return minI;
}

function hexToRGB(color) {
  const r = parseInt(color.substr(1,2), 16)
  const g = parseInt(color.substr(3,2), 16)
  const b = parseInt(color.substr(5,2), 16)
  return [r, g, b];
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

export { colors, closestColor, hexToRGB, rgbaObjToCss, rgbObjToArr, rgbArrToObj }