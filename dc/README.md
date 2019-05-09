# dc-docker
Build the dc docker image

### build

```bash
docker build -t motebus/dc .
``` 

### run

__must run the motechat/bus-stack before running the motechat/dc.__

[motechat/bus-stack](https://github.com/MoteChat/bus-stack-image)

```bash
docker run -d --net=container:<bus-stack container> motebus/dc
``` 
