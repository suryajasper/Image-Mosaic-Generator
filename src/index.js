import m from 'mithril';
import './css/main.scss';
import WordArt from './wordart';
import Jimp from 'jimp';
import { colors, closestColor, hexToRGB, rgbaObjToCss, rgbObjToArr, rgbArrToObj } from './color';
import { init2D } from './utils';

function importAll(r) {
  console.log(r);
  return r.keys().map(r);
}

const images = importAll(require.context('./background_imgs/carol_imgs/', false, /\.(png|jpe?g)$/));
console.log(images);

class Main {
  constructor(vnode) {
    this.image = null;
    this.src = '';
    this.color = '';
    this.bitmap = [[]];
    this.tintlayer = [[]];
    this.scale = 1;
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
    this.reload(images[this.imgIndex]);
  }

  reload(image) {
    const RESOLUTION = 85;

    let new_height = RESOLUTION;
    let new_width = RESOLUTION;
    let tint_layer_alpha = 0.0;

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
                closestColor(
                  rgbObjToArr(
                    Jimp.intToRGBA(
                      resized.getPixelColor(c, r)
                    )
                  )
                )
              ]
                .img
            )
          );
        
        this.tintlayer = init2D(resized.bitmap.height, resized.bitmap.width)
          .map((row, r) => 
            row.map((_, c) => 
              /*rgbaObjToCss(
                Jimp.intToRGBA(
                  resized.getPixelColor(c, r)
                ), { a: tint_layer_alpha }
              )*/
              /*
              rgbaObjToCss(
                rgbArrToObj(
                  colors[
                    closestColor(
                      rgbObjToArr(
                        Jimp.intToRGBA(
                          resized.getPixelColor(c, r)
                        )
                      )
                    )
                  ].color
                ), { a: tint_layer_alpha }
              )
                  */
                ''
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

      m('div', {class: 'image-grid', style: `grid-template-columns: repeat(${this.bitmap[0].length}, 1fr)`}, this.bitmap.map(
        (row, r) => row.map((pixel, c) => {
          return m('div.img-group', {style: {
            width: this.getImgSize(),
            height: this.getImgSize(),
          }}, [
            m('img', {src: this.bitmap[r][c]}),
            m('div.tint-layer', {style: {'background-color': this.tintlayer[r][c]}}),
          ]);
        })
      )),

      m("div", {

        class: `drag-area`,
        ondrop      : this.handleDrop      .bind(this),
        ondragover  : e => e.preventDefault(),
        /*
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
        },*/
        
        onwheel: e => {
          if (e.shiftKey) {
            let shift = - Math.abs(e.deltaY) / e.deltaY;
            this.scale += 0.1 * shift;
            e.preventDefault();
          }
        },

      }),

    ];
  }
}

m.mount(document.body, Main);