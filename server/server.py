from flask import Flask, request, send_file
from flask_cors import CORS, cross_origin

from os import path, listdir, remove
from shutil import rmtree
import json
import base64

import cv2
from PIL import Image
from transforms import RGBTransform
import numpy as np

from img_process import add_photos

def to_base64(file_name):
  data = ''
  with open(file_name , "rb") as image_file :
    data = base64.b64encode(image_file.read())
  return data.decode('utf-8')

def read_json(file_name):
  data = {}
  with open(file_name , "r") as json_file:
    data = json.load(json_file)
  return data

app = Flask(__name__)

@app.route('/')
@cross_origin()
def home():
  return 'hey!'

@app.route('/upload_images', methods=['POST'])
@cross_origin()
def upload():
  if request.method == 'POST':
    
    batch_size = request.form.get('batch_size')
    id = request.form.get('id')

    if batch_size:
      fs = [request.files.get(str(i)) for i in range(int(batch_size))]
      
      print('FileStorage:', fs)
      print('filename:', [fl.filename for fl in fs])

      for fl in fs:
        fl.save(path.join('temp', fl.filename))
      
      add_photos(id=id)

      filelist = [ f for f in listdir('temp') if path.isfile(path.join('temp', f)) ]
      for f in filelist:
        remove(path.join('temp', f))

      return batch_size
    
    else:
      print('none')

  return 'use post request'

@app.route('/upload_mosaic_img', methods=['POST'])
@cross_origin()
def upload_mosaic_img():

  id = request.form.get('uid')
  mosaic_img = request.files.get('mosaicImg')

  if id and mosaic_img:
    mosaic_img.save(path.join('out', id, 'mosaic.jpg'))
    return id

  else:
    return 'no id or mosaic image'

@app.route('/get_mosaic_img', methods=['GET'])
@cross_origin()
def send_mosaic_img():

  id = request.args.get('uid')
  mosaic_img = to_base64(path.join('out', id, 'mosaic.jpg'))

  return { "img": mosaic_img }

@app.route('/get_img_count', methods=['GET'])
@cross_origin()
def send_image_count():
  
  id = request.args.get('id')

  if not path.exists(path.join('out', id, 'imgs')):
    return '0'

  img_list = [ f for f in listdir(path.join('out', id, 'imgs')) if path.isfile(path.join('out', id, 'imgs', f)) ]

  return str(len(img_list))

@app.route('/get_images', methods=['GET'])
@cross_origin()
def send_images():
  id = request.args.get('id')
  palette_type = request.args.get('palette') or 'avg'

  if id and path.exists(path.join('out', id, 'imgs')):
    img_list = [ f for f in listdir(path.join('out', id, 'imgs')) if path.isfile(path.join('out', id, 'imgs', f)) ]
    img_list = sorted(img_list, key = lambda f : int(f.split('.')[0]))
    img_list = [ path.join('out', id, 'imgs', f) for f in img_list ]
    img_list = list(map(to_base64, img_list))

    color_file = path.join('out', id, 'data', f'{palette_type}.json')
    colors = read_json(color_file)

    return {
      "imgs": img_list,
      "colors": colors
    }

  else:
    return 'NONE'

@app.route('/remove_imgs', methods=['POST'])
@cross_origin()
def remove_images():
  body = request.get_json(force=True)
  id = body['id']
  to_remove = body['selected']

  rmtree(path.join('out', id))

  return 'DONE'

@app.route('/generate_mosaic', methods=['POST'])
@cross_origin()
def generate_mosaic():
  body = request.get_json(force=True)
  
  id = body['uid']
  id_map = body['idMap']
  tint_map = body['tintMap']
  tint_factor = body['tintFactor']

  bitmap = []

  for r in range(len(id_map)):
    row = []

    for c in range(len(id_map[r])):
      img_id = id_map[r][c]

      img = Image.open(path.join('out', id, 'imgs', f'{img_id}.jpg'))
      img = img.convert('RGB')

      tint_transform = RGBTransform().mix_with(tint_map[r][c], factor=tint_factor)
      tinted = tint_transform.applied_to(img)

      np_img = np.array(tinted)
      cv2_img = cv2.cvtColor(np_img, cv2.COLOR_RGB2BGR) 

      row.append(cv2_img)
    
    bitmap.append(row)

  rows = [ np.concatenate(row, axis=1) for row in bitmap ]
  img = np.concatenate(rows, axis=0)

  # cv2.imshow('img', img)

  out_path = path.join('out', id, 'final.jpg')

  cv2.imwrite(out_path, img)

  img_base64 = to_base64(out_path)
  
  return { "img": img_base64 }

@app.route('/get_mosaic')
@cross_origin()
def send_mosaic():
  id = request.args.get('uid')

  return send_file(path.join('out', id, 'final.jpg'))

if __name__ == "__main__":
  app.run(port=8814)

CORS(app, resources={r"*": {"origins": "*"}})