import m from 'mithril';

import { signup, login } from './auth';

import './css/login.css';

export default class Login {
  constructor(vnode) {
    this.status = vnode.attrs.status;
    this.confirmPass = '';
    this.params = {
      email: '',
      password: '',
    };
  }

  authenticateUser(isSignup) {
    const { email, password } = this.params;
    const authFunc = isSignup ? signup(email, password) : login(email, password);

    authFunc.then(res => {
      if (res.uid) this.status('success', res.uid);
      else this.status('failed', res.error);
    });
  }

  view(vnode) {
    return m("div", {"class":"modal", "style": `display: ${vnode.attrs.active ? "block" : "none"}`},
      m("form", { class: "modal-content animate", id: "loginform" }, [

        m("div", {"class":"container"}, [
          
          m("label", {"for":"email"}, m("b", "Email")),

          m("input", {
            id: "email",
            type: "text",
            name: "email",
            placeholder: "email address",
            required: "required",
            oninput: e => {
              this.params.email = e.target.value;
            },
          }),

          m("label", m("b", "Password")),

          m("input", {
            type: "password",
            placeholder: "password",
            oninput: e => {
              this.params.password = e.target.value;
            },
          }),

          vnode.attrs.signup ? [
            m("label", m("b", "Confirm Password")),
  
            m('input', {
              type: 'password',
              placeholder: 'Re-enter Password',
              oninput: e => {
                this.confirmPass = e.target.value;
              },
            }),
          ] : '',
          
          m("button", {
            class: "nobuttoncss", 
            onclick: e => { e.preventDefault(); this.authenticateUser(vnode.attrs.signup); }, 
            disabled: vnode.attrs.signup && this.params.password !== this.confirmPass,
          }, vnode.attrs.signup ? 'Sign Up' : 'Log In'),

        ]),

        m("div", {"class":"container highlight"}, 
          m("button", {"class":"cancelbtn nobuttoncss","type":"button", onclick: e => {
            this.status('cancelled');
          }}, "Cancel")
        )
      ])
    )
  }
}
