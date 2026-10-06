import os
import tempfile
import unittest
from pathlib import Path
import sys
import numpy as np
from PIL import Image

workspace = tempfile.TemporaryDirectory()
os.environ['MOSAIC_DATA_DIR'] = workspace.name
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'server'))
import server

class LocalLibraryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.folder = Path(self.tmp.name)
        self.client = server.app.test_client()
        with server.db() as conn:
            conn.execute('DELETE FROM photos')
            conn.execute('DELETE FROM settings')
            conn.execute('DELETE FROM portraits')
        Image.new('RGB', (100, 80), (90, 80, 70)).save(self.folder / 'a.jpg')
        Image.new('RGB', (80, 100), (210, 200, 190)).save(self.folder / 'b.png')

    def tearDown(self):
        self.tmp.cleanup()

    def scan(self, **extra):
        return self.client.post('/api/import', json={'path': str(self.folder), **extra})

    def test_crop_selection_external_changes_and_restart(self):
        self.assertEqual(self.scan().json['imported'], 2)
        first = self.client.get('/api/library').json['photos'][0]
        self.client.patch('/api/photos/'+first['id'], json={'x': .2, 'y': .8, 'size': .4, 'rotation':90,'selected':False})
        old = Path(first['path']); new = old.with_name('renamed'+old.suffix);old.rename(new)
        self.scan()
        record = server.photo(first['id'])
        self.assertEqual(record['path'],str(new))
        self.assertEqual(record['size'],.4)
        self.assertEqual(record['selected'],0)
        image = server.open_photo(record)
        self.assertEqual(image.size,(32,32))
        saved = new.read_bytes();new.unlink();self.scan()
        self.assertEqual(len(self.client.get('/api/library').json['photos']),1)
        new.write_bytes(saved);self.scan()
        restored=self.client.get('/api/library').json['photos']
        self.assertEqual(len(restored),2)
        self.assertEqual(next(p for p in restored if p['path']==str(new))['size'],.4)
        Image.new('RGB',(20,20),'red').save(self.folder/'new.jpg');self.scan()
        self.assertEqual(len(self.client.get('/api/library').json['photos']),3)

    def test_matching_counts_and_determinism(self):
        pixels=np.tile([100.,100.,100.],(200,1));colors=np.array([[100.,100.,100.],[110.,110.,110.],[120.,120.,120.]])
        exact, counts=server.match_tiles(pixels,colors,0,42)
        self.assertEqual(counts.tolist(),[200,0,0])
        tiles,counts=server.match_tiles(pixels,colors,1,42)
        self.assertEqual(counts.sum(),200)
        self.assertTrue(np.all(counts>0))
        self.assertTrue(np.array_equal(tiles,server.match_tiles(pixels,colors,1,42)[0]))

    def test_full_variety_is_balanced_random_and_ignores_colors(self):
        colors=np.array([[0.,0.,0.],[255.,255.,255.],[20.,30.,40.],[80.,90.,100.]])
        for total in (0, 2, 4, 17, 200):
            pixels=np.zeros((total,3))
            tiles,counts=server.match_tiles(pixels,colors,1,42)
            self.assertEqual(len(tiles),total)
            self.assertEqual(counts.sum(),total)
            self.assertLessEqual(int(counts.max()-counts.min()),1)
            self.assertTrue(np.array_equal(counts,np.bincount(tiles,minlength=len(colors))))
            recolored,_=server.match_tiles(np.full((total,3),255.),colors[::-1],1,42)
            self.assertTrue(np.array_equal(tiles,recolored))
        self.assertFalse(np.array_equal(tiles,server.match_tiles(pixels,colors,1,43)[0]))

    def test_heic_confirmation_and_cached_conversion(self):
        from pillow_heif import from_pillow
        heic=(self.folder/'memory.HEIC').resolve()
        from_pillow(Image.new('RGB',(90,60),'orange')).save(heic)
        original=heic.read_bytes()
        self.assertEqual(len(self.scan().json['needsConversion']),1)
        self.assertEqual(self.client.post('/api/convert',json={'paths':[str(heic)]}).status_code,200)
        self.assertTrue(server.converted_path(heic).is_file())
        self.assertEqual(self.scan().json['imported'],3)
        self.assertEqual(heic.read_bytes(),original)
        row=next(p for p in self.client.get('/api/library').json['photos'] if p['path']==str(heic))
        with self.client.get('/api/photos/'+row['id']+'/image') as response:
            self.assertEqual(response.status_code,200)
        renamed=heic.with_name('renamed.HEIC');heic.rename(renamed)
        self.assertNotIn('needsConversion',self.scan().json)
        heic=renamed
        self.assertEqual(self.client.post('/api/target',json={'path':str(heic)}).status_code,200)

    def test_foreground_mask_excludes_background_and_is_cached(self):
        from unittest.mock import patch
        import io
        self.scan()
        path=str(self.folder/'a.jpg')
        self.client.post('/api/target',json={'path':path})
        def cutout(image, directory):
            result=image.convert('RGBA')
            alpha=Image.new('L',image.size,0)
            alpha.paste(255,(0,0,image.width//2,image.height))
            result.putalpha(alpha)
            return result
        with patch.object(server.background,'ready',return_value=True), patch.object(server.background,'remove_background',side_effect=cutout) as remove:
            self.assertEqual(self.client.post('/api/target/options',json={'foreground':True}).status_code,200)
            result=self.client.post('/api/mosaic',json={'columns':12,'variety':.35}).json
            self.assertEqual(result['activeTiles'],60)
            self.assertEqual(sum(result['counts']),60)
            self.assertEqual(result['tiles'].count(-1),60)
            self.assertEqual(len(result['tiles']),120)
            self.assertTrue(result['backgroundUrl'].startswith('/api/backgrounds/'))
            with self.client.get(result['backgroundUrl']) as response:
                with Image.open(io.BytesIO(response.data)) as original:
                    self.assertEqual(original.mode,'RGB')
                    self.assertEqual(original.size,(100,80))
                    self.assertEqual(original.getpixel((99,0)),server.open_photo({'path':path,'rotation':0},False).getpixel((99,0)))
            with self.client.get(result['maskUrl']) as response:
                with Image.open(io.BytesIO(response.data)) as mask:
                    self.assertEqual(mask.getpixel((99,0))[3],0)
                    self.assertEqual(mask.getpixel((0,0))[3],255)
            self.client.post('/api/mosaic',json={'columns':12,'variety':.8})
            self.assertEqual(remove.call_count,1)
            self.assertTrue(self.client.get('/api/library').json['foreground'])
            self.assertEqual(self.client.post('/api/target/options',json={'mosaicRegion':'background'}).status_code,200)
            inverted=self.client.post('/api/mosaic',json={'columns':12}).json
            self.assertEqual(inverted['mosaicRegion'],'background')
            self.assertEqual(inverted['activeTiles'],60)
            self.assertEqual(sum(inverted['counts']),60)
            self.assertEqual([tile == -1 for tile in inverted['tiles']], [tile != -1 for tile in result['tiles']])
            self.assertEqual(inverted['maskUrl'],result['maskUrl'])
            self.assertEqual(remove.call_count,1)
            self.assertEqual(self.client.get('/api/library').json['mosaicRegion'],'background')
            self.client.post('/api/target/options',json={'foreground':False})
            full=self.client.post('/api/mosaic',json={'columns':12}).json
            self.assertEqual(full['activeTiles'],120)
            self.assertIsNone(full['maskUrl'])
            self.assertNotIn(-1,full['tiles'])
        self.assertEqual(self.client.post('/api/target/options',json={'mosaicRegion':'invalid'}).status_code,400)
        self.assertEqual(self.client.post('/api/target/options',json={'foreground':'true'}).status_code,400)
        with patch.object(server.background,'ready',return_value=False):
            self.assertEqual(self.client.post('/api/target/options',json={'foreground':True}).status_code,400)

    def test_png_export_is_saved_locally(self):
        import io
        output=io.BytesIO()
        Image.new('RGB',(100,100),'green').save(output,'PNG')
        result=self.client.post('/api/exports',data=output.getvalue(),content_type='image/png')
        self.assertEqual(result.status_code,200)
        self.assertEqual(Path(result.json['path']).read_bytes(),output.getvalue())
        with self.client.get(result.json['url']) as response:
            self.assertEqual(response.status_code,200)
            self.assertIn('attachment',response.headers['Content-Disposition'])
        self.assertEqual(self.client.post('/api/exports',data=b'bad').status_code,400)

    def test_target_generation_and_security(self):
        self.scan()
        self.assertEqual(self.client.post('/api/target',json={'path':str(self.folder/'a.jpg')}).status_code,200)
        response=self.client.post('/api/mosaic',json={'columns':12,'variety':.5,'seed':42})
        self.assertEqual(response.status_code,200)
        m=response.json
        self.assertEqual(len(m['tiles']),m['columns']*m['rows'])
        self.assertEqual(sum(m['counts']),len(m['tiles']))
        self.assertEqual(self.client.get('/api/library',headers={'Origin':'https://evil.example'}).status_code,403)
        self.assertEqual(self.client.get('/api/library',headers={'Host':'evil.example'}).status_code,403)
        self.assertEqual(self.client.patch('/api/photos/'+m['ids'][0],json={'size':0}).status_code,400)
        self.assertEqual(self.client.post('/api/mosaic',json={'columns':999}).status_code,400)

if __name__=='__main__':
    unittest.main()
