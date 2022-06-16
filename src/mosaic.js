import m from 'mithril';
import './css/mosaic.scss';
import WordArt from './wordart';
import Jimp from 'jimp';
import { colors, loadColors, closestColors, hexToRGB, rgbaObjToCss, rgbObjToArr, rgbArrToObj } from './color';
import { init2D, randArr, downloadURI, base64ToArrayBuffer } from './utils';
import getUid from './auth';

function RangeGroup(vnode) {
  
  const {title, initialVal, min, max, step} = vnode.attrs;
  let newVal = initialVal;

  return {
    view(vnode) {
      return m('div.range-container', [
        m('p.range-title', title),
        m('input', {
          type: 'range',
          min, max, step, 
          value: newVal, 

          oninput: e => {
            newVal = e.target.value;
            vnode.attrs.update(newVal);
          }
        }),
        m('p.range-value', newVal)
      ]);
    }
  };

}

export default class Mosaic {
  constructor(vnode) {
    this.image = null;
    this.selectedImg = null;
    this.src = '';
    this.color = '';
    this.bitmap = [[]];
    this.tintlayer = [[]];
    this.uniques = [];

    this.resolution = 85;
    this.balance = 3;
    this.tintLayerAlpha = 0.2;
  }
  
  oninit(vnode) {
    // this.imgIndex = Math.floor(Math.random()*images.length);
    this.image = vnode.attrs.img || window.localStorage.getItem('img');
    loadColors().then(() => {
      m.redraw();
      this.reload();
    })
    window.onresize = e => {
      this.getGridSize();
      m.redraw();
    } 
  }

  async export() {

    const uid = await getUid();
    const idMap = this.bitmap.map(row => row.map(el => el.id)); 
    const tintFactor = this.tintLayerAlpha;
    const tintMap = this.tintlayer.map(row => row.map(rgbObjToArr));

    const data = { uid, idMap, tintFactor, tintMap };
    
    const res = await m.request({
      url: 'http://127.0.0.1:8814/generate_mosaic',
      method: 'POST',
      body: data,
    });

    const arrayBuffer = base64ToArrayBuffer(res.img);

    const blob = new Blob([arrayBuffer], {type: 'image/jpg'});
    const blobUrl = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.setAttribute('download', 'mosaic.jpg');
    a.href = blobUrl;
    document.body.appendChild(a);
    a.click();
    // a.remove();

  }

  reload() {

    console.log(this);

    let new_height = this.resolution;
    let new_width = this.resolution;

    Jimp.read(this.image)
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
                  ), false,
                ).i
              ]
            )
          );

        this.uniques = [... new Set(this.bitmap
          .reduce((a, b) => a.concat(b))
          .map(pix => pix.id)
        )];
        
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

  getGridSize() {

    console.log('getGridSize')

    let height = this.bitmap.length;
    let width = this.bitmap[0].length;

    if (width/height < window.innerWidth/window.innerHeight)
      return {
        width: `${this.bitmap[0].length/this.bitmap.length*100}vh`,
        height: `100vh`,
      }

    return {
      width: `100vw`,
      height: `${this.bitmap.length/this.bitmap[0].length*100}vw`,
    }
  }

  updateParam(param, value, reload) {
    this[param] = parseFloat(value);
    if (reload) this.reload();
  }

  view(vnode) {

    return m('div.mosaic-page', [

      m('div', {
        class: 'mosaic-grid', 
        style: Object.assign({
          'grid-template-columns': `repeat(${this.bitmap[0].length}, 1fr)`,
        }, this.getGridSize())
      }, 
        this.bitmap.map(
          (row, r) => row.map((pixel, c) => {

            return m('div', {
              class: `img-group ${(this.selectedImg !== null && pixel.id !== this.selectedImg) ? 'grayed' : ''}`
            }, [
              m('img', {src: pixel.img}),
              m('div.tint-layer', {
                style: { 'background-color': rgbaObjToCss( this.tintlayer[r][c], { a: this.tintLayerAlpha } ), }
              }),
            ]);

          })
        )
      ),

      m('div.mosaic-sidebar', [

        m('div.params', 
          [
            {title: 'Resolution', min: 30, max: 120, step: 1, initialVal: this.resolution, update: val => this.updateParam('resolution', val, true)},
            {title: 'Noise', min: 1, max: 10, step: 1, initialVal: this.balance, update: val => this.updateParam('balance', val, true)},
            {title: 'Tint', min: 0, max: 1, step: 0.05, initialVal: this.tintLayerAlpha, update: val => this.updateParam('tintLayerAlpha', val, false)},
          ]
          .map(el => m(RangeGroup, el))
          .concat([ m('button', { onclick: e => { this.export() } }, 'Export') ])
        ),
        
        m('div.img-grid', {
          onmouseleave: e => {
            this.selectedImg = null;
          }
        },
          colors.map((el, id) => m('img', {
            class: `${this.uniques.includes(id) ? '' : 'hidden'}`,
            src: el.img,
            onmouseover: e => {
              this.selectedImg = id;
            },
          }))
        ),

      ]),

    ]);

  }
}