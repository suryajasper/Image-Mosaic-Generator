from flask import Flask, request

from os import path, listdir, remove
import json
import base64

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
def home():
  return 'hey!'

@app.route('/upload_images', methods=['POST'])
def upload():
  if request.method == 'POST':
    
    batch_size = request.form.get('batch_size')

    if batch_size:
      fs = [request.files.get(str(i)) for i in range(int(batch_size))]
      
      print('FileStorage:', fs)
      print('filename:', [fl.filename for fl in fs])

      for fl in fs:
        fl.save(path.join('temp', fl.filename))
      
      add_photos()

      filelist = [ f for f in listdir('temp') if path.isfile(path.join('temp', f)) ]
      for f in filelist:
        remove(path.join('temp', f))

      return batch_size
    
    else:
      print('none')

  return 'use post request'
  
@app.route('/get_images', methods=['GET'])
def send_images():
  id = request.args.get('id')
  palette_type = request.args.get('palette') or 'avg'

  if id:
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
    return 'need id'

if __name__ == "__main__":
  app.run(port=8814)