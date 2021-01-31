FROM ubuntu:focal

RUN apt-get update && apt-get install -y curl wget gnupg git

RUN curl -sL https://dl.yarnpkg.com/debian/pubkey.gpg | apt-key add -
RUN echo "deb https://dl.yarnpkg.com/debian/ stable main" | tee /etc/apt/sources.list.d/yarn.list

# This is the only way to pin to Node 14.6.0, the nodesource repository removes
# old point versions whenever they do a minor update (which breaks our attempt to 
# pin to a specific version with apt-get)
RUN curl -sL https://deb.nodesource.com/setup_15.x | sudo -E bash - \
    && apt install -y nodejs
    
RUN apt-get update && apt-get install -y \
    yarn=1.22.1-1 \
    build-essential

RUN yarn global add @angular/cli@10.0.4 \
    @nestjs/cli@7.4.1 \    
    nx 

# Download rust and add it to the PATH
RUN curl https://sh.rustup.rs -sSf |  bash -s -- -y
RUN echo 'source $HOME/.cargo/env' >> $HOME/.bashrc
ENV PATH "$PATH:/root/.cargo/bin"

ENV PATH "$PATH:/opt/pulpd/node_modules/.bin"

WORKDIR /opt/pulpd
COPY . .
RUN ls

RUN yarn install
RUN nx build server

EXPOSE 8080
EXPOSE 3333
EXPOSE 3000
EXPOSE 27017

ENTRYPOINT ["node", "./dist/packages/server/main.js"]