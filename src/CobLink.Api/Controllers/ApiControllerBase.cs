using CobLink.Api.Infrastructure;
using Microsoft.AspNetCore.Mvc;

namespace CobLink.Api.Controllers
{
    /// <summary>
    /// Base class of the RPC-style controllers: routes are api/{Controller}/{Action} and every action returns the
    /// ServiceResponse envelope (failures are produced by ApiExceptionFilter).
    /// </summary>
    [ApiController]
    [Route("api/[controller]/[action]")]
    [Produces("application/json")]
    public abstract class ApiControllerBase : ControllerBase
    {
        protected static ServiceResponse<T> Success<T>(T data)
        {
            return ServiceResponse<T>.Ok(data);
        }
    }
}
