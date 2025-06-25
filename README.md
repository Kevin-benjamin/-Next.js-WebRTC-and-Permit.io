This is an article on Building a Secure Video Conferencing App with Next.js, WebRTC, and Permit.io

## Getting Started

First, run your Docker Permit PDP container. If you don't have that setup, open a CLI in Docker and paste the command below:

```bash
docker pull permitio/pdp-v2:latest
```

Command above pulls the latest Permit PDP image from Docker Hub. Next run:

```bash
docker run -it \
  -p 7766:7000 \
  --env PDP_API_KEY="<PERMIT_API_KEY>" \
  --env PDP_DEBUG=True \
  permitio/pdp-v2:latest
```

Replace `<PERMIT_API_KEY>` with your actual Permit API key. The PDP will be running on port 7766. Add your API key to a `.env` file in the root directory of this project with the variable `PERMIT_API_KEY`.

Next run `npm install` to install dependencies. And finally, run the development server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.
