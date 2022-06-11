import m from 'mithril';
import './css/mosaic.scss';
import WordArt from './wordart';
import Jimp from 'jimp';
import { colors, loadColors, closestColors, hexToRGB, rgbaObjToCss, rgbObjToArr, rgbArrToObj } from './color';
import { init2D, randArr } from './utils';

function importAll(r) {
  console.log(r);
  return r.keys().map(r);
}

const images = importAll(require.context('./background_imgs/carol_imgs/', false, /\.(png|jpe?g)$/));
console.log(images);

export default class Mosaic {
  constructor(vnode) {
    this.image = null;
    this.src = '';
    this.color = '';
    this.bitmap = [[]];
    this.tintlayer = [[]];

    this.scale = 1;
    this.resolution = 85;
    this.balance = 3;
    this.tintLayerAlpha = 0.4;
  }
  
  handleDrop(e) {
    e.preventDefault();
    
    var FR = new FileReader();
    
    FR.readAsDataURL( e.dataTransfer.files[0] );
    
    FR.addEventListener("load", ev => {
      this.reload(ev.target.result);
    }); 
    
  }
  
  oninit(vnode) {
    this.imgIndex = Math.floor(Math.random()*images.length);
    loadColors().then(() => {
      this.reload(images[this.imgIndex]);
    })
  }

  reload(image) {
    let new_height = this.resolution;
    let new_width = this.resolution;

    //window.onresize = m.redraw;

    Jimp.read(image)
      .then(img => {
        if (img.bitmap.width > img.bitmap.height)
          new_width = parseInt(new_height / img.bitmap.height * img.bitmap.width);
        else
          new_height = parseInt(new_width / img.bitmap.width * img.bitmap.height);
        console.log('rescale', new_height * new_width);

        let resized = img.resize(new_width, new_height, Jimp.RESIZE_NEAREST_NEIGHBOR);
        resized.getBase64(Jimp.MIME_JPEG, (err, res) => {
          this.src = res; 

          Jimp.read
          m.redraw();
        });

        this.bitmap = init2D(resized.bitmap.height, resized.bitmap.width)
          .map((row, r) => 
            row.map((_, c) => 
              colors[
                randArr(
                  closestColors(
                    rgbObjToArr(
                      Jimp.intToRGBA(
                        resized.getPixelColor(c, r)
                      )
                    ), this.balance,
                  )
                ).i
              ]
            )
          );
        
        this.tintlayer = init2D(resized.bitmap.height, resized.bitmap.width)
          .map((row, r) => 
            row.map((_, c) => 
              Jimp.intToRGBA(
                resized.getPixelColor(c, r)
              )
            )
          );

        m.redraw();

      })
      .catch(console.error)
  }

  getImgSize() {

    let height = this.bitmap.length;
    let width = this.bitmap[0].length;

    if (width/height < window.innerWidth/window.innerHeight)
      return `${Math.ceil(window.innerHeight / height * this.scale)}px`;

    return `${Math.round(window.innerWidth / width * this.scale)}px`
  }

  view(vnode) {
    return [

      m('div.params', [
        m('p', 'Resolution'),
        m('input', {type: 'range', min: 30, max: 120, value: this.resolution, oninput: e => {
          this.resolution = parseInt(e.target.value);
          this.reload(images[this.imgIndex]);
        }}),
        m('p', 'Noise'),
        m('input', {type: 'range', min: 1, max: 10, step: 1, value: this.balance, oninput: e => {
          this.balance = parseInt(e.target.value);
          this.reload(images[this.imgIndex]);
        }}),
        m('p', 'Tint'),
        m('input', {type: 'range', min: 0, max: 1, step: 0.05, value: this.tintLayerAlpha, oninput: e => {
          this.tintLayerAlpha = parseFloat(e.target.value);
        }}),
      ]),

      m('div', {class: 'image-grid', style: `grid-template-columns: repeat(${this.bitmap[0].length}, 1fr)`}, this.bitmap.map(
        (row, r) => row.map((pixel, c) => {
          return m('div.img-group', {style: {
            width: this.getImgSize(),
            height: this.getImgSize(),
          }}, [
            m('img', {src: this.bitmap[r][c].img}),
            m('div.tint-layer', {
              style: {
                'background-color': rgbaObjToCss( this.tintlayer[r][c], { a: this.tintLayerAlpha } ),
              }
            }, /*this.bitmap[r][c].id*/),
          ]);
        })
      )),

      /*
      m("div", {

        class: `drag-area`,
        ondrop      : this.handleDrop      .bind(this),
        ondragover  : e => e.preventDefault(),

        
        onclick     : e => {
          this.scale = 1;
          this.imgIndex = this.imgIndex >= images.length-1 ? 0 : this.imgIndex+1;
          this.reload(images[this.imgIndex]);
        },
        oncontextmenu: e => {
          e.preventDefault();
          this.scale = 1;
          this.imgIndex = this.imgIndex <= 0 ? images.length-1 : this.imgIndex-1;
          this.reload(images[this.imgIndex]);
          return false;
        },
        
        onwheel: e => {
          if (e.shiftKey) {
            let shift = - Math.abs(e.deltaY) / e.deltaY;
            this.scale += 0.1 * shift;
            e.preventDefault();
          }
        },

      }),
      */

    ];
  }
}