import m from 'mithril';
import './css/main.scss';
import WordArt from './wordart';
import Jimp from 'jimp';
import { colors, closestColor, hexToRGB, rgbObjToArr } from './color';
import { init2D } from './utils';

function importAll(r) {
  console.log(r);
  return r.keys().map(r);
}

const images = importAll(require.context('./carol_imgs/', false, /\.(png|jpe?g)$/));
console.log(images);

class Main {
  constructor(vnode) {
    this.image = null;
    this.src = '';
    this.color = '';
    this.bitmap = [[]];

    console.log(colors[closestColor([104, 213, 104])]);
  }

  handleDrop(e) {
    e.preventDefault();
    console.log('dropped');

    console.log(e)

    var FR = new FileReader();
    
    FR.readAsDataURL( e.dataTransfer.files[0] );

    FR.addEventListener("load", ev => {
      this.reload(ev.target.result);
    }); 
    
  }

  oninit(vnode) {
    this.reload(images[Math.floor(Math.random()*images.length)]);
  }

  reload(image) {
    let new_height = 90;
    let new_width = 90;

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

        m.redraw();

          console.log(this.bitmap);

      })
      .catch(console.error)
  }

  getImgSize() {

    let height = this.bitmap.length;
    let width = this.bitmap[0].length;

    if (width/height < window.innerWidth/window.innerHeight)
      return `${Math.ceil(window.innerHeight / height)}px`;

    return `${Math.round(window.innerWidth / width)}px`
  }

  view(vnode) {
    return [

      m("div", {

        class: `drag-area`,
        ondrop      : this.handleDrop      .bind(this),
        ondragover  : e => e.preventDefault()

      }),

      m('div', {class: 'image-grid', style: `grid-template-columns: repeat(${this.bitmap[0].length}, 1fr)`}, this.bitmap.map(
        (row, r) => row.map((pixel, c) => {
          return m('img', {style: {
            width: this.getImgSize()
          }, src: this.bitmap[r][c]});
        })
      )),

    ];
  }
}

m.mount(document.body, Main);