import Rand from "rand-seed";

function msToTime(s) {
  const ms = s % 1000;
  s = (s - ms) / 1000;

  const secs = s % 60;
  s = (s - secs) / 60;

  if (s >= 60) {
    const mins = s % 60;
    s = (s - mins) / 60;
    return `${s}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  } else return `${s}:${secs.toString().padStart(2, '0')}`;

}

function arr2D(arr1D, rows) {
  const cols = arr1D.length / rows;
  const newArr = [];

  for (let i = 0; i < rows; i++) {
    newArr.push(arr1D.slice(i * cols, i * cols + cols));
  }

  return newArr;
}

function init2D(rows, cols, val=0) {
  let arr = [];
  for (let r = 0; r < rows; r++) {
    let row = [];
    for (let c = 0; c < cols; c++) row.push(val);
    arr.push(row);
  }
  return arr;
}

function splitArray(arr, size) {
  let newArr = [];

  while (arr.length > 0)
    newArr.push(arr.splice(0, size));
  
  return newArr;
}

function numToPercent(num) {
  return `${Math.round(num*100*100)/100}%`;
}

function randomStr(length) {
  var randomChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  var result = '';
  for ( var i = 0; i < length; i++ ) {
      result += randomChars.charAt(Math.floor(Math.random() * randomChars.length));
  }
  return result;
}

let rand = {
  seed: undefined,
  gen: undefined,
};

function randArr(array, seed, weighted=true) {

  if (Array.isArray(array)) {
    
    if (rand.seed !== seed) rand = { seed, gen: new Rand(seed) };

    let ind = 0;

    if (weighted) {
      let weights = array.map(el => 1 / el.d);
      let sum = weights.reduce((a, b) => a + b);
      weights = weights.map(w => w / sum);
      
      let r = rand.gen.next();
      
      for (let i = 1; i < weights.length; i++) {
        weights[i] = weights[i] + weights[i-1];
        if (r >= weights[i-1] && r < weights[i]) {
          ind = i;
          break;
        }
      }
    }
    else {
      ind = Math.floor(rand.gen.next() * array.length);
    }

    return array[ind];
  }
  else 
    return array;

}

function downloadURI(uri, name) 
{
  const link = document.createElement("a");

  link.setAttribute('download', name);
  link.href = uri;

  document.body.appendChild(link);

  link.click();
}

function base64ToArrayBuffer(base64) {
  var binary_string = window.atob(base64);
  var len = binary_string.length;
  var bytes = new Uint8Array(len);
  for (var i = 0; i < len; i++) {
      bytes[i] = binary_string.charCodeAt(i);
  }
  return bytes.buffer;
}

export { msToTime, arr2D, init2D, splitArray, numToPercent, randArr, randomStr, downloadURI, base64ToArrayBuffer };