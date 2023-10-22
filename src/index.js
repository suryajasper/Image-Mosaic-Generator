import m from 'mithril';

import './css/upload.scss';
import './css/progress-bar.scss';

import ImageUpload from './imageupload';
import Mosaic from './mosaic';
import ImageBuckets from './imagebuckets';

import { getUid } from './auth';
import Login from './login';
import Cookies from './cookies';
import PricingPlans from './pricing-plans';

function importAll(r) {
  console.log(r);
  return r.keys().map(r);
}

const exampleImgs = importAll(require.context('./imgs/examples/', false, /\.(png|jpe?g)$/));

export default class Main {

  constructor(vnode) {
    this.popup = {
      active: false,
      signup: false,
    }
  }

  oninit(vnode) {

    getUid().then(uid => {
      
      m.request({
        method: 'GET',
        url: `http://localhost:8814/get_img_count?id=${uid}`
      })
        .then(count => {
          if (count > 0)
            m.route.set('/main');
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
          m.route.set('/main')
        }
      }),

      m(Login, {
        active: this.popup.active,
        signup: this.popup.signup,
        status: (type, res) => {
          if (type === 'success') {
            Cookies.set('uid', res, 24);
            m.route.set('/main');
          } else if (type === 'failed')
            alert(res);
          this.popup.active = false;
        }
      }),

      m("footer", [
        m('div.login-button-container', [
          m('div', { onclick: () => {
            this.popup = { active: true, signup: false };
          } }, 'Log In'),
          m('div',  { onclick: () => {
            this.popup = { active: true, signup: true };
          } }, 'Sign up'),
        ]),
      ]),

    ];
  }
}

m.route(document.body, '/', {
  '/': Main,
  '/main': ImageBuckets,
  '/subscribe': PricingPlans,
  '/mosaic/:mode/:id/:seed/:params': Mosaic,
});

// m.mount(document.body, PricingPlans);