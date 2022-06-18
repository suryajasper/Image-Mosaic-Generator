import m from 'mithril';
import Jimp from 'jimp';

import './css/upload.scss';
import './css/progress-bar.scss';

import ImageUpload from './imageupload';
import Mosaic from './mosaic';
import ImageBuckets from './imagebuckets';

import { Icon, icons } from './icons';
import { splitArray, numToPercent } from './utils';
import getUid from './auth';
import Cookies from './cookies';

function importAll(r) {
  console.log(r);
  return r.keys().map(r);
}

const exampleImgs = importAll(require.context('./imgs/examples/', false, /\.(png|jpe?g)$/));

export default class Main {

  oninit(vnode) {

    getUid().then(uid => {
      
      m.request({
        method: 'GET',
        url: `http://suryajasper.com:8814/get_img_count?id=${uid}`
      })
        .then(count => {
          if (count > 0)
            m.mount(document.body, ImageBuckets);
            // m.mount(document.body, Mosaic);
        })

    });

  }

  view(vnode) {
    return [
      
      m('div.background-container', exampleImgs.map(base64 => 
        m('img', {src: base64})  
      )),

      m(ImageUpload, {
        success: () => {
          m.mount(document.body, ImageBuckets);
        }
      })

    ];
  }
}

m.route(document.body, '/', {
  '/': Main,
  '/:id': Mosaic,
});