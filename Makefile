.PHONY: all

all:
	npm install
	forever stopall
	forever start --minUptime 1000 --spinSleepTime 1000 -a -l /home/git/temp/log index.js --port=8080 --debug
	forever list
