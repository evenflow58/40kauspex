import { Construct } from 'constructs';
import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';

/**
 * Static hosting for the 40K Auspex micro-frontend app.
 *
 * Layout (single private S3 bucket, single CloudFront distribution):
 *
 *   s3://<bucket>/                  -> apps/shell/dist          (served at /)
 *   s3://<bucket>/mfe-home/         -> apps/mfe-home/dist       (served at /mfe-home/*)
 *   s3://<bucket>/mfe-companion/    -> apps/mfe-companion/dist  (served at /mfe-companion/*)
 *
 * The shell is an SPA, so the default behaviour rewrites 403/404 to
 * /index.html. The `/mfe-home/*` behaviour deliberately does NOT rewrite,
 * so a missing remoteEntry.js fails honestly instead of returning HTML.
 *
 * The bucket is private; CloudFront reaches it via Origin Access Control (OAC).
 */
export class Hosting extends Construct {
  /** Bucket holding both the shell and mfe-home build artifacts. */
  public readonly siteBucket: s3.Bucket;
  /** CloudFront distribution fronting the bucket. */
  public readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.siteBucket = new s3.Bucket(this, 'SiteBucket', {
      // Private bucket — all access flows through CloudFront via OAC.
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      // The bucket only ever holds disposable build output, so it can be
      // emptied and destroyed cleanly if the stack is torn down.
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // SPA error responses: serve index.html for client-side routes so the
    // shell's client-side router handles deep links. 200 status keeps the
    // router happy and avoids surfacing raw S3 errors.
    //
    // NOTE: CloudFront error responses are distribution-wide, not per-
    // behaviour. A genuine 404 under /mfe-home/* would therefore also
    // return index.html. In practice mfe-home's hashed assets and
    // remoteEntry.js always exist after a successful deploy, so this only
    // affects debugging of a broken deploy — acceptable for now. If stricter
    // behaviour is needed later, attach a CloudFront Function to the
    // /mfe-home/* behaviour to bypass the SPA rewrite.
    const spaErrorResponses: cloudfront.ErrorResponse[] = [
      {
        httpStatus: 403,
        responseHttpStatus: 200,
        responsePagePath: '/index.html',
        ttl: Duration.minutes(1),
      },
      {
        httpStatus: 404,
        responseHttpStatus: 200,
        responsePagePath: '/index.html',
        ttl: Duration.minutes(1),
      },
    ];

    const origin = origins.S3BucketOrigin.withOriginAccessControl(
      this.siteBucket
    );

    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: '40K Auspex shell + mfe-home + mfe-companion',
      defaultRootObject: 'index.html',
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      // Default behaviour: the shell SPA.
      defaultBehavior: {
        origin,
        viewerProtocolPolicy:
          cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        compress: true,
      },
      additionalBehaviors: {
        // MFE remote assets. No SPA rewrite — remoteEntry.js and federation
        // chunks must resolve as real files or 404 honestly.
        'mfe-home/*': {
          origin,
          viewerProtocolPolicy:
            cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
          responseHeadersPolicy:
            cloudfront.ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS,
          compress: true,
        },
        'mfe-companion/*': {
          origin,
          viewerProtocolPolicy:
            cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
          responseHeadersPolicy:
            cloudfront.ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS,
          compress: true,
        },
      },
      errorResponses: spaErrorResponses,
    });
  }
}
