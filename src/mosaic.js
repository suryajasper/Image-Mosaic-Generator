import m from 'mithril';
import './css/mosaic.scss';
import Jimp from 'jimp';
import { colors, loadColors, closestColors, hexToRGB, rgbaObjToCss, rgbObjToArr, rgbArrToObj } from './color';
import { initArr, randArr, downloadURI, base64ToArrayBuffer, randomStr, ParamParser, base64ImgHeader } from './utils';
import { getUid } from './auth';
import Main from '.';
import IconButton from './icon-button';

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
          disabled: vnode.attrs.disabled,

          oninput: e => {
            newVal = e.target.value;
          },

          onchange: e => {
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

    this.bitmap = [[]];
    this.source = [[]];
    this.uniques = [];

    this.admin = false;

    this.loading = true;

    let [resolution, balance, tintLayerAlpha] = ParamParser.decode(vnode.attrs.params);
    this.resolution = parseInt(resolution);
    this.balance = parseInt(balance);
    this.tintLayerAlpha = parseFloat(tintLayerAlpha);

    this.mode = vnode.attrs.mode;
  }
  
  oninit(vnode) {

    const {id} = vnode.attrs;

    getUid().then(uid => {
      this.admin = uid === id;
    })

    m.request(`http://suryajasper.com:8814/get_mosaic_img?uid=${id}`, {
      method: 'GET',
    }).then((res) => {

      if (res.error) { return m.route.set('/'); }

      this.image = base64ImgHeader(res.img);

      loadColors(id, vnode.attrs.mode === 'spotify').then(() => {
        m.redraw();
        this.reload(vnode.attrs.seed);
      })

    })

    window.onresize = e => {
      this.getGridSize();
      m.redraw();
    } 

  }

  async export() {

    this.loading = true;

    const uid = await getUid();
    const tintFactor = this.tintLayerAlpha;
    const idMap = this.bitmap.map(row => row.map(el => el.id)); 
    const tintMap = this.bitmap.map(row => row.map(el => rgbObjToArr(el.color)));

    const data = { uid, idMap, tintFactor, tintMap };
    
    const res = await m.request({
      url: 'http://suryajasper.com:8814/generate_mosaic',
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
    
    this.loading = false;

  }

  reload(seed) {

    this.loading = true;

    let new_height = this.resolution;
    let new_width = this.resolution;

    Jimp.read(this.image)
      .then(img => {
        if (img.bitmap.width > img.bitmap.height)
          new_width = parseInt(new_height / img.bitmap.height * img.bitmap.width);
        else
          new_height = parseInt(new_width / img.bitmap.width * img.bitmap.height);

        let resized = img.resize(new_width, new_height, Jimp.RESIZE_NEAREST_NEIGHBOR);

        this.source = initArr([resized.bitmap.height, resized.bitmap.width])
          .map((row, r) => row.map((_, c) => 
            Jimp.intToRGBA( 
              resized.getPixelColor(c, r)
            )
          ));

        this.bitmap = this.source
          .map(row => 
            row.map(color => {

              const id = randArr(
                closestColors(
                  rgbObjToArr(color), colors, this.balance,
                ), seed, false,
              ).i;

              return { color, id, img: colors[id].img };

            })
          );

        this.uniques = [... new Set(this.bitmap
          .reduce((a, b) => a.concat(b))
          .map(pix => pix.id)
        )];

        this.loading = false;
        m.redraw();

      })
      .catch(console.error)
  }

  useAll() {
    
    let frequency = initArr([colors.length], 0);

    this.bitmap
      .forEach(row => 
        row.forEach(({id}) => { 
          frequency[id]++;
        })
      );

    let imgColors = this.source
      .map((row, y) => 
        row.map((color, x) => {
          return {
            color: rgbObjToArr(color),
            pos: { x, y },
          }
        })
      )
      .flat();

    let prox = colors.map(({color}) =>
      closestColors(color, imgColors, (this.resolution/4)**2)
        .map(el => imgColors[el.i])
    );

    for (let i = 0; i < frequency.length; i++) {

      for (let candidate of prox[i]) {

        let {x, y} = candidate.pos;

        let imgInPos = this.bitmap[y][x].id;

        if (frequency[i] < frequency[imgInPos] && frequency[imgInPos] > 1) {          
          this.bitmap[y][x].img = colors[i].img;
          this.bitmap[y][x].id = i;

          frequency[imgInPos]--;
          frequency[i]++;
        }
        
      }

    }

    this.uniques = [... new Set(this.bitmap
      .reduce((a, b) => a.concat(b))
      .map(pix => pix.id)
    )];

  }

  getGridSize() {

    let height = this.source.length;
    let width = this.source[0].length;

    if (width/height < window.innerWidth/window.innerHeight)
      return {
        width: `${this.source[0].length/this.source.length*100}vh`,
        height: `100vh`,
      }

    return {
      width: `100vw`,
      height: `${this.source.length/this.source[0].length*100}vw`,
    }

  }

  updateParam(param, value, reload) {

    this[param] = parseFloat(value);

    let seed = reload ? randomStr(6) : m.route.param('seed');
    let id = m.route.param('id');
    let paramStr = ParamParser.encode(this.resolution, this.balance, this.tintLayerAlpha);

    if (reload) this.reload(seed);

    m.route.set(`/mosaic/${this.mode}/${id}/${seed}/${paramStr}`);

  }

  view(vnode) {

    return m('div.mosaic-page', [

      /*
      m('div.tool-group', [
        m(IconButton, {
          icon: 'exit', 
          title: 'Back', 
          onclick: () => {
            this.resetSelection();
          }
        }),
        m(IconButton, {
          icon: 'export', 
          title: 'Export', 
          onclick: () => {
            this.resetSelection();
          }
        }),
        m(IconButton, {
          icon: 'gear', 
          title: 'Clear Selection', 
          onclick: () => {
            this.resetSelection();
          }
        }),
      ]),
      */

      m('div', {
        class: 'mosaic-grid', 
        style: Object.assign({
          'grid-template-columns': `repeat(${this.bitmap[0].length}, 1fr)`,
        }, this.getGridSize())
      }, 
        this.bitmap.map(row => 
          row.map(pixel => {

            return m('div', {
              class: `img-group ${ this.loading || (this.selectedImg !== null && pixel.id !== this.selectedImg) ? 'grayed' : '' }`
            }, [
              m('img', {src: pixel.img}),
              m('div.tint-layer', {
                style: { 'background-color': rgbaObjToCss( pixel.color, { a: this.tintLayerAlpha } ), }
              }),
            ]);

          })
        )
      ),

      m('div.mosaic-overlay', {
        style: Object.assign({
          display: this.loading ? 'flex' : 'none',
        }, this.source[0].length > 0 ? this.getGridSize() : {})
      }, [
        m('div.loader'),
      ]),

      m('div.mosaic-sidebar', [

        this.admin ? (m('div.params', 
          [
            {title: 'Resolution', min: 30, max: 140, step: 1, initialVal: this.resolution, disabled: this.loading, update: val => this.updateParam('resolution', val, true)},
            {title: 'Noise', min: 1, max: 10, step: 1, initialVal: this.balance, disabled: this.loading, update: val => this.updateParam('balance', val, true)},
            {title: 'Tint', min: 0, max: 1, step: 0.02, initialVal: this.tintLayerAlpha, disabled: this.loading, update: val => this.updateParam('tintLayerAlpha', val, false)},
          ]
          .map(el => m(RangeGroup, el))
          .concat([
            m('div.button-group', [
              m('button', { onclick: e => { m.route.set('/main') } }, 'Back'),
              m('button', { disabled: this.loading, onclick: e => { this.useAll() } }, 'Use All'),
              m('button', { disabled: this.loading, onclick: e => { this.export() } }, 'Export'),
              m('p', `${this.uniques.length}/${colors.length} ${Math.round(this.uniques.length/colors.length*100*10)/10}%`),
            ]),
          ])
        )) : '',
        
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