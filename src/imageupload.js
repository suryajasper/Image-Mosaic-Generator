import m from 'mithril';
import './css/upload.scss';
import './css/progress-bar.scss';
import { icons } from './icons';
import { splitArray, numToPercent } from './utils';
import getUid from './auth';

export default class ImageUpload {
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

  uploadToServer(images, uid) {
    
    const formdata = new FormData();
    formdata.append('batch_size', images.length);
    formdata.append('id', uid);
    for (let i = 0; i < images.length; i++)
      formdata.append(`${i}`, images[i]);

    return new Promise((res, rej) => {
      
      var xhr = new XMLHttpRequest();
      xhr.open("POST", "http://127.0.0.1:8814/upload_images", true);
      xhr.onload = function() {
        if (this.status === 200) res();
        else rej();
      };
      xhr.send(formdata);

    })

  }

  async uploadImages(images) {

    this.drop.uploaded = true;
    this.progress.max = images.length;
    this.progress.curr = 0;

    const BATCH_SIZE = 5;
    const uid = await getUid();

    let batches = splitArray(images, BATCH_SIZE);

    for (let batch of batches) {
      const res = await this.uploadToServer(batch, uid);
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
    return m('div.upload-container', {style: {visibility: vnode.attrs.hidden ? 'hidden' : 'visible'}},

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
            accept: 'image/png, image/jpeg',
            id: "csvIn", 
            multiple: true, 
            hidden:"hidden", 
            onchange: async e => {
              if (vnode.attrs.startUpload) vnode.attrs.startUpload();
              await this.uploadImages([...e.target.files]);
              vnode.attrs.success();
            }
          })

        ]),

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

    );

  }
}