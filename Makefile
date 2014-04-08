.PHONY: all

all:
	npm install
	forever stopall
	forever start --minUptime 1000 \
                  --spinSleepTime 1000 \
                  -a \
                  -l /home/git/temp/log \
                  -m 5 \
            index.js --port=8080 \
                     --host=0.0.0.0 \
                     --interval=60000 \
                     --debug
	forever list
