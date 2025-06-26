import { Permit } from "permitio"

export const permit = new Permit({
  //  Our Docker instance is running on port 7766
  pdp: "http://localhost:7766",
  // Add your api token also to a .env file with the variable below
  token: process.env.PERMIT_API_KEY,
})
