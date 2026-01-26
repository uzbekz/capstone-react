import jwt from "jsonwebtoken";

const SECRET = "my_super_secret_key";

export function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader)
    return res.status(401).json({ message: "No token provided" });

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, SECRET); // concatenates the (header.payload) and hashes it using the algorithm specified in the header and verifies it with the singnature if not equal throws an error that's why it's in a try catch block, if valid it returns the payload
    req.user = decoded; // assiging the user key to the payloaod object eg: {id : 1 , role : 'product_manager'}
    next(); // calls the next middleware which is the authorize function below
  } catch {
    res.status(401).json({ message: "Invalid token" });
  }
}

export function authorize(role) {
  return (req, res, next) => {
    if (req.user.role !== role) {
      return res.status(403).json({ message: "Access denied" });
    }
    next();
  };
}

/*
What req.headers.authorization Contains
When a client (like your frontend) sends a JWT, the convention is to put it in the Authorization header using the Bearer scheme:

Code
Authorization: Bearer <JWT_TOKEN>
So in Express:

req.headers.authorization will be a string like:

Code
"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6..."
Then your code does:

js
const token = authHeader.split(" ")[1];
→ which extracts just the token part (eyJhbGciOi...).
*/


/*
in express you have to explicitely mention these
// 400 Bad Request -  Used when the client sends an invalid request (wrong format, missing required fields, invalid JSON).
res.status(400).json({ message: "Invalid input" });

// 401 Unauthorized -- when jwt doesn't exist
res.status(401).json({ message: "No token provided" });

// 403 Forbidden - when the user is not authorized to acces the endpoint
res.status(403).json({ message: "Access denied" });

// 404 Not Found -  when the user request for an invalid data that doesn't exist
res.status(404).json({ message: "User not found" });

*/
