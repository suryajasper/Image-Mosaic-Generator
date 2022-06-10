import m from 'mithril';
import './css/upload.scss';
import './css/progress-bar.scss';
import Jimp from 'jimp';
import Mosaic from './mosaic';
import { Icon, icons } from './icons';
import { splitArray, numToPercent } from './utils';

function importAll(r) {
  console.log(r);
  return r.keys().map(r);
}

const exampleImgs = importAll(require.context('./imgs/examples/', false, /\.(png|jpe?g)$/));

class Main {
  constructor() {
    this.base64s = [];
    this.currImg = 0;

    this.drop = {
      failed: false,
      uploaded: false,
    };

    this.progress = {
      curr: 0,
      max: 1,
    };
  }

  uploadToServer(images) {
    
    const formdata = new FormData();
    formdata.append('batch_size', images.length);
    for (let i = 0; i < images.length; i++)
      formdata.append(`${i}`, images[i]);
    
    /* return m.request({
      method: "POST",
      url: "http://127.0.0.1:8814/upload_images",
      data: formdata,
      serialize: function(formdata) {return formdata}
    }) */

    return new Promise((res, rej) => {
      
      var xhr = new XMLHttpRequest();
      xhr.open("POST", "http://127.0.0.1:8814/upload_images", true);
      xhr.onload = function() {
        if(this.status === 200) {
          res();
        } else {
          rej();
        }
      };
      xhr.send(formdata);

    })

  }

  async uploadImages(images) {

    this.drop.uploaded = true;
    this.progress.max = images.length;
    this.progress.curr = 0;

    const BATCH_SIZE = 5;

    console.log('UPLOADED', images);

    let batches = splitArray(images, BATCH_SIZE);

    for (let batch of batches) {
      const res = await this.uploadToServer(batch);
      this.progress.curr += batch.length;
      m.redraw();
    }

    return 'GOOD';

  }

  handleDragOver(e) {
    e.preventDefault();
  }

  handleDragLeave(e) {
    console.log('leave');
  }

  handleDrop(e) {
    e.preventDefault();
    console.log('dropped');
    this.uploadImages(e.dataTransfer.files);
  }

  view(vnode) {
    return [
      
      m('div.background-container', exampleImgs.map(base64 => 
        m('img', {src: base64})  
      )),

      m('div.upload-container', [

        m("div", { 
          
          class: `drag-area ${this.drop.uploaded ? 'uploaded' : ''}`,

          ondragover  : this.handleDragOver  .bind(this),
          ondragleave : this.handleDragLeave .bind(this),
          ondrop      : this.handleDrop      .bind(this),

        }, [

          m('div.upload-start', [

            m('div.icon', icons.upload),
    
            m("header", "Get Started for Free!"),
            m("span", m.trust("Drag & Drop images OR")),
    
            m("button", {class: 'drag-drop-button', onclick: e => {
              document.querySelector('input#csvIn').click();
            }}, "Browse"),
    
            m("input", {
              type: "file",
              id: "csvIn", 
              multiple: true, 
              hidden:"hidden", 
              onchange: async e => {
                await this.uploadImages([...e.target.files]);
              }
            })

          ]),

          /*m('progress.upload-progress', {

            value: this.progress.curr, 
            max: this.progress.max

          })*/

          m('div.progressbar', [
            m('svg.progressbar__svg', 
              m('circle.progressbar__svg-circle.circle-html.shadow-html', {

                style: `stroke-dashoffset: ${440 - (440 * 100 * this.progress.curr / this.progress.max) / 100}`,
                cx: 80, cy: 80, r: 70,

              })
            ),
            m('span.progressbar__text.shadow-html', 
              numToPercent(this.progress.curr / this.progress.max)
            )
          ])

        ])

      ])

    ];
  }
}

m.mount(document.body, Mosaic);