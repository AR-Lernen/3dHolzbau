# baut index.html (alles in einer Datei, offlinefähig) aus template.html + model.json + three.min.js
import sys
t = open('template.html', encoding='utf8').read()
t = t.replace('/*THREE*/', open(sys.argv[2], encoding='utf8').read().replace('</script', '<\\/script'), 1)
t = t.replace('/*MODEL*/', open(sys.argv[1], encoding='utf8').read(), 1)
open('index.html', 'w', encoding='utf8').write(t)
