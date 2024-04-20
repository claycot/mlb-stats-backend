const customCorsOptions = {
    origin: (origin, callback) => {
        const allowedOrigins = process.env.hasOwnProperty("ALLOWED_ORIGINS") ? process.env.ALLOWED_ORIGINS!.split(" ") : [];
        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error("Request from unauthorized origin"));
        }
    },
};

export default customCorsOptions;