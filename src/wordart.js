import m from 'mithril';
import { arr2D, init2D } from './utils';

class Particle {
  constructor(pos){
    this.x = pos.x;
    this.y = pos.y + 30;
    this.x0 = this.x;
    this.y0 = this.y;
    this.xDelta = 0;
    this.yDelta = 0;
    this.alpha = pos.a;
  }
}

class Bounds {
  constructor() {
    this.right  = -1e99;
    this.bottom = -1e99;

    this.top    =  1e99;
    this.left   =  1e99;
  }

  add({x, y}) {
    if (x > this.right) this.right = x;
    if (y > this.bottom) this.bottom = y;

    if (y < this.top) this.top = y;
    if (x < this.left) this.left = x;
  }

  get rect() {
    return {
      right: this.right,
      left: this.left,
      bottom: this.bottom,
      top: this.top,
    };
  }
}

export default class WordArt {
  
  constructor(vnode) {
    this.particles = [];
  }

  oncreate(vnode) {
    this.canvas = document.querySelector('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.width = this.canvas.width;
    this.height = this.canvas.height;
    
    let image = this.setupParticles(this.getTextCanvasData(vnode.attrs.text.toUpperCase()));
    vnode.attrs.oncomplete(image);
  }

  drawParticle(particle) {
    const scale = 10;

    this.ctx.beginPath();
    this.ctx.fillStyle = `rgba(0,255,0,${particle.alpha})`;
    this.ctx.fillRect(particle.x*scale, particle.y*scale+150, scale, scale);
  }

  setupParticles(image) {

    let height = image.length;
    let width = image[0].length;

    let factor = 8;

    let rl = parseInt(height / factor);

    let newImage = init2D(factor, parseInt(width * factor / height));

    console.log(height, width, factor, parseInt(width * factor / height));

    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        newImage[ parseInt(row / rl) ][ parseInt(col / rl) ] += image[row][col];
      }
    }

    for (let row = 0; row < newImage.length; row++) {
      for (let col = 0; col < newImage[row].length; col++) {
        let pixel = newImage[row][col];
        pixel /= rl**2;
        if (pixel <= 0.4) pixel = 0;
        newImage[row][col] = pixel;
        this.drawParticle({x: col, y: row, alpha: pixel});
      }
    }

    console.log('NEW',newImage.length*newImage[0].length);

    return newImage;

  }
  
  getTextCanvasData(str) {
  
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.fillStyle = "rgb(0, 154, 253)";
    this.ctx.font = "bold 53px Monaco";

    this.ctx.fillText(str.split("").join(String.fromCharCode(8202)),0,100);

    const pixels = this.ctx.getImageData(0, 0, this.width, this.height).data;
    const data32 = new Uint32Array(pixels.buffer);
    let image = arr2D(data32, this.height);
    console.log(image.length, image[0].length);

    console.log(data32.length, data32[10000])
    
    const positions = [];

    const bounds = new Bounds();

    for (let row = 0; row < image.length; row++) {
      for (let col = 0; col < image[row].length; col++) {
        let i = row * image[row].length + col;
        if (data32[i] & 0xffff0000) {
          bounds.add({x: col, y: row});
        }
      }
    }
    
    let newImage = init2D(bounds.bottom-bounds.top+1, bounds.right-bounds.left+1);

    for (let row = bounds.top; row <= bounds.bottom; row++) {
      for (let col = bounds.left; col <= bounds.right; col++) {
        let i = row * image[row].length + col;

        let rgb = (pixels[i*4]+pixels[i*4+1]+pixels[i*4+2])/3;

        newImage[row-bounds.top][col-bounds.left] = (rgb > 0) ? pixels[i*4+3] / 255 : 0;
      }
    }

    return newImage;

  }  

  view(vnode) {
    return m('canvas', {height: 200, width: 1000});
  }
  
}