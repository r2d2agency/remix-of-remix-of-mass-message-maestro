FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

RUN echo "nameserver 8.8.8.8" > /etc/resolv.conf && echo "nameserver 1.1.1.1" >> /etc/resolv.conf

EXPOSE 3001

CMD ["sh", "-c", "echo 'nameserver 8.8.8.8\nnameserver 1.1.1.1' > /etc/resolv.conf && npm start"]
